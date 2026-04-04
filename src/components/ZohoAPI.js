const ORG_ID = process.env.REACT_APP_ZOHO_ORG;
const BASE_ITEMS = `https://www.zohoapis.in/books/v3`;
const BASE_PROXY = `https://zoho-proxy.biz-laxmitrading.workers.dev/books/v3`;

const getAccessToken = () => localStorage.getItem('accessToken');

const delay = (ms) => new Promise((res) => setTimeout(res, ms));

async function fetchWithRetry(url, options, retries = 3) {
	for (let i = 0; i < retries; i++) {
		const res = await fetch(url, options);
		if (res.status !== 429) return res;
		await delay((i + 1) * 1000);
	}
	throw new Error('Max retries exceeded (429)');
}

function authHeaders() {
	return { Authorization: `Zoho-oauthtoken ${getAccessToken()}` };
}

// ─── STEP 1: fetch all low stock items (paginated) ───────────────────────────

async function getLowStockItems() {
	let page = 1;
	let allItems = [];
	let hasMore = true;

	while (hasMore) {
		const url = `${BASE_ITEMS}/items?organization_id=${ORG_ID}&filter_by=Status.Lowstock&page=${page}&per_page=100`;
		const res = await fetchWithRetry(url, { headers: authHeaders() });
		const data = await res.json();

		allItems = allItems.concat(data.items || []);
		hasMore = data.page_context?.has_more_page;
		page++;
		await delay(300);
	}

	return allItems;
}

// ─── STEP 2: collect item_ids that already have an open PO ───────────────────

async function getOpenPOItemIds() {
	let page = 1;
	let openPOs = [];
	let hasMore = true;

	while (hasMore) {
		const url = `${BASE_PROXY}/purchaseorders?organization_id=${ORG_ID}&filter_by=Status.Open&page=${page}&per_page=100`;
		const res = await fetchWithRetry(url, { headers: authHeaders() });
		const data = await res.json();

		openPOs = openPOs.concat(data.purchaseorders || []);
		hasMore = data.page_context?.has_more_page;
		page++;
		await delay(300);
	}

	if (openPOs.length === 0) return new Set();

	const coveredItemIds = new Set();

	for (const po of openPOs) {
		try {
			const url = `${BASE_PROXY}/purchaseorders/${po.purchaseorder_id}?organization_id=${ORG_ID}`;
			const res = await fetchWithRetry(url, { headers: authHeaders() });
			const data = await res.json();

			const lineItems = data.purchaseorder?.line_items || [];
			for (const line of lineItems) {
				if (line.item_id) coveredItemIds.add(line.item_id);
			}

			await delay(300);
		} catch {
			// skip failed PO fetches
		}
	}

	return coveredItemIds;
}

// ─── STEP 3: enrich a single item ────────────────────────────────────────────

async function enrichSingleItem(item) {
	try {
		const url = `${BASE_ITEMS}/items/${item.item_id}?organization_id=${ORG_ID}`;
		const res = await fetchWithRetry(url, { headers: authHeaders() });
		const data = await res.json();

		await delay(300);

		const d = data.item;

		const taxIdInter = d.item_tax_preferences?.find((p) => p.tax_specification === 'inter')?.tax_id || null;
		const taxIdIntra = d.item_tax_preferences?.find((p) => p.tax_specification === 'intra')?.tax_id || null;

		return {
			...item,
			vendor_id: d.vendor_id || null,
			vendor_name: d.vendor_name || 'Unknown Vendor',
			brand: d.brand || 'Unknown Brand',
			manufacturer: d.manufacturer || 'Unknown Manufacturer',
			// PO rate — use purchase rate, fall back to selling rate
			purchase_rate: d.purchase_rate || d.rate || 0,
			purchase_account_id: d.purchase_account_id || null,
			// Store both intra and inter tax IDs — chosen at PO creation time
			tax_id_intra: taxIdIntra,
			tax_id_inter: taxIdInter,
			tax_id: d.tax_id || d.purchase_tax_id || taxIdIntra || taxIdInter || null,
			// Quantity fields matching the 'Populate Qty' Deluge script
			available_stock: d.available_stock ?? d.stock_on_hand ?? 0,
			reorder_level: d.reorder_level ?? null,
			created_time: d.created_time || null,
			minimum_order_quantity: d.minimum_order_quantity || 0,
		};
	} catch {
		return item;
	}
}

// ─── SALES: quantity sold for an item over last 6 months ─────────────────────

async function getSalesLast6Months(itemId) {
	try {
		const today = new Date();
		const toDate = today.toISOString().split('T')[0];
		const from = new Date(today);
		from.setMonth(from.getMonth() - 6);
		const fromDate = from.toISOString().split('T')[0];

		const params = new URLSearchParams({
			organization_id: ORG_ID,
			from_date: fromDate,
			to_date: toDate,
			rule: JSON.stringify({
				columns: [{ index: 1, field: 'item_id', value: [itemId], comparator: 'in', group: 'report' }],
				criteria_string: '1',
			}),
			select_columns: JSON.stringify([{ field: 'quantity_sold', group: 'report' }]),
		});

		const url = `${BASE_PROXY}/reports/salesbyitem?${params.toString()}`;
		const res = await fetchWithRetry(url, { headers: authHeaders() });
		const data = await res.json();

		if (data.code === 0 && data.sales?.length > 0) {
			return Number(data.sales[0].quantity_sold) || 0;
		}
		return 0;
	} catch {
		return 0;
	}
}

// ─── BUNDLE ALLOCATION: velocity-weighted qty distribution ────────────────────
// Mirrors the Deluge 'Populate Qty' bundle logic exactly.

async function calculateBundleQuantities(items, bundleSize) {
	const today = new Date();
	const candidates = [];
	let totalWeightedNeed = 0;

	for (const item of items) {
		const maxCap = Number(item.cf_maximum_capacity);
		const availStock = Number(item.available_stock ?? item.stock_on_hand ?? 0);

		if (maxCap <= 0) continue;

		const rawQtyToOrder = maxCap - availStock;
		if (rawQtyToOrder <= 0) continue;

		const salesLast6Months = await getSalesLast6Months(item.item_id);
		await delay(150);

		// Actual days: 180, or days since creation if item is younger than 6 months
		let actualDays = 180;
		if (item.created_time) {
			const createdDate = new Date(item.created_time.substring(0, 10));
			const daysSince = Math.floor((today - createdDate) / 86400000);
			if (daysSince > 0 && daysSince < 180) actualDays = daysSince;
		}

		const velocity =
			salesLast6Months > 0 ? salesLast6Months / actualDays : 1.0 / actualDays;

		const weightedNeed = rawQtyToOrder * velocity;
		if (weightedNeed <= 0) continue;

		const minOrderQty = item.minimum_order_quantity > 0 ? item.minimum_order_quantity : 1;

		totalWeightedNeed += weightedNeed;
		candidates.push({ item, velocity, weightedNeed, minOrderQty });
	}

	if (candidates.length === 0 || totalWeightedNeed <= 0) return null;

	// Initial proportional allocation
	const allocated = candidates.map((c) => {
		const ideal = (c.weightedNeed / totalWeightedNeed) * bundleSize;
		const baseQty = Math.max(Math.floor(ideal), c.minOrderQty);
		return { ...c, baseQty, remainder: ideal - baseQty };
	});

	// Rounding correction — use Math.floor to match Deluge's bundle.toLong()
	const totalAssigned = allocated.reduce((s, c) => s + c.baseQty, 0);
	const diff = Math.floor(bundleSize) - totalAssigned;

	if (diff > 0) {
		// Give excess to highest-velocity item
		const idx = allocated.reduce(
			(best, c, i) => (c.velocity > allocated[best].velocity ? i : best),
			0,
		);
		allocated[idx].baseQty += diff;
	} else if (diff < 0) {
		// Take from lowest-velocity item (never below minOrderQty)
		const idx = allocated.reduce(
			(best, c, i) => (c.velocity < allocated[best].velocity ? i : best),
			0,
		);
		const canRemove = Math.min(-diff, allocated[idx].baseQty - allocated[idx].minOrderQty);
		if (canRemove > 0) allocated[idx].baseQty -= canRemove;
	}

	const qtyMap = {};
	for (const c of allocated) {
		if (c.baseQty > 0) qtyMap[c.item.item_id] = c.baseQty;
	}
	return qtyMap;
}

// ─── BILL RATE: most recent bill rate for a vendor + item ────────────────────
// Mirrors the 'Populate Rate' Deluge script logic.

async function getBillRateForItem(vendorName, itemId) {
	try {
		const params = new URLSearchParams({
			organization_id: ORG_ID,
			vendor_name: vendorName,
			item_id: itemId,
			sort_column: 'date',
			sort_order: 'D',
			per_page: '1',
		});

		const listRes = await fetchWithRetry(
			`${BASE_PROXY}/bills?${params.toString()}`,
			{ headers: authHeaders() },
		);
		const listData = await listRes.json();

		if (listData.code !== 0 || !listData.bills?.length) return null;

		const billId = listData.bills[0].bill_id;
		await delay(300);

		const detailRes = await fetchWithRetry(
			`${BASE_PROXY}/bills/${billId}?organization_id=${ORG_ID}`,
			{ headers: authHeaders() },
		);
		const detailData = await detailRes.json();

		if (detailData.code !== 0) return null;

		const lineItems = detailData.bill?.line_items || [];
		for (const li of lineItems) {
			if (li.item_id === itemId && li.rate != null) {
				return Number(li.rate);
			}
		}
		return null;
	} catch {
		return null;
	}
}

// ─── VENDOR DETAILS ───────────────────────────────────────────────────────────

async function getVendorDetails(vendorId) {
	const url = `${BASE_PROXY}/contacts/${vendorId}?organization_id=${ORG_ID}`;
	const res = await fetchWithRetry(url, { headers: authHeaders() });
	const data = await res.json();
	return data.contact || {};
}

// ─── DISCOUNT ACCOUNT: cached lookup for "Purchase Discounts" account ID ─────

let _discountAccountId = null;
let _discountAccountFetched = false;

async function getDiscountAccountId() {
	if (_discountAccountFetched) return _discountAccountId;
	try {
		const url = `${BASE_PROXY}/chartofaccounts?organization_id=${ORG_ID}&search_text=Purchase+Discounts`;
		const res = await fetchWithRetry(url, { headers: authHeaders() });
		const data = await res.json();
		const account = data.chartofaccounts?.find(
			(a) => a.account_name?.toLowerCase() === 'purchase discounts',
		);
		_discountAccountId = account?.account_id || null;
		console.log('[getDiscountAccountId] →', _discountAccountId);
	} catch {
		_discountAccountId = null;
	}
	_discountAccountFetched = true;
	return _discountAccountId;
}

// ─── ORG STATE: cached fetch of the organisation's state ─────────────────────

let _orgState = null;
let _orgStateFetched = false;

async function getOrgState() {
	if (_orgStateFetched) return _orgState;
	try {
		const res = await fetchWithRetry(
			`${BASE_PROXY}/organizations?organization_id=${ORG_ID}`,
			{ headers: authHeaders() },
		);
		const data = await res.json();
		// Filter by ORG_ID to ensure we pick the right org when the token has access to multiple orgs
		const org = data.organizations?.find((o) => String(o.organization_id) === String(ORG_ID))
			|| data.organizations?.[0];
		console.log('[getOrgState] matched org →', org?.organization_id, org?.name, '| state_code →', org?.state_code);
		_orgState = { name: org?.state?.toLowerCase().trim() || null, code: org?.state_code?.toLowerCase().trim() || null };
	} catch (e) {
		console.error('[getOrgState] error →', e);
		_orgState = null;
	}
	_orgStateFetched = true;
	return _orgState;
}

// ─── VENDORS: fetch all vendors ───────────────────────────────────────────────

export async function getVendors() {
	let page = 1;
	let allVendors = [];
	let hasMore = true;

	while (hasMore) {
		const url = `${BASE_PROXY}/contacts?organization_id=${ORG_ID}&contact_type=vendor&page=${page}&per_page=200`;
		const res = await fetchWithRetry(url, { headers: authHeaders() });
		const data = await res.json();

		allVendors = allVendors.concat(data.contacts || []);
		hasMore = data.page_context?.has_more_page;
		page++;
		if (hasMore) await delay(300);
	}

	return allVendors;
}

// ─── CREATE PO ────────────────────────────────────────────────────────────────
//
// bundleSize > 0 → velocity-weighted bundle allocation (mirrors 'Populate Qty')
// bundleSize = 0 → simple: qty = max_capacity - available_stock

export async function createPurchaseOrder(vendorId, items, bundleSize = 0, populateRate = false, discount = 0, discountType = '%', roundOff = true) {
	const [vendor, orgState, discountAccountId] = await Promise.all([
		getVendorDetails(vendorId),
		getOrgState(),
		discount > 0 ? getDiscountAccountId() : Promise.resolve(null),
	]);

	// Compare org state_code vs vendor's place_of_contact (state code) for GST determination
	// place_of_contact is the authoritative GST field on Indian vendor contacts (e.g. "TS", "TN")
	const vendorStateCode = vendor.place_of_contact?.toLowerCase().trim() || null;
	const orgStateCode = orgState?.code?.toLowerCase().trim() || null;
	console.log('[createPO] orgStateCode →', orgStateCode, '| vendorStateCode →', vendorStateCode);
	const isInterstate =
		vendorStateCode && orgStateCode
			? vendorStateCode !== orgStateCode
			: true; // default to interstate (IGST) if state info is unavailable
	console.log('[createPO] isInterstate →', isInterstate);

	// Bundle mode needs sales data per item — calculate before building line items
	let qtyMap = null;
	if (bundleSize > 0) {
		qtyMap = await calculateBundleQuantities(items, bundleSize);
	}

	// Rate lookup: fetch most recent bill rate per item from this vendor
	const billRateMap = {};
	if (populateRate && vendor.contact_name) {
		for (const item of items) {
			const rate = await getBillRateForItem(vendor.contact_name, item.item_id);
			if (rate !== null) billRateMap[item.item_id] = rate;
			await delay(150);
		}
	}

	const lineItems = items.flatMap((item) => {
		let quantity;

		if (qtyMap !== null) {
			// Bundle mode: only include items that received an allocation
			// (overflow and zero-weight items are excluded, matching Deluge behaviour)
			if (qtyMap[item.item_id] === undefined) return [];
			quantity = qtyMap[item.item_id];
		} else {
			// Simple mode: qty = max_capacity - available_stock (toLong → Math.floor)
			const maxCap = Number(item.cf_maximum_capacity);
			const availStock = Number(item.available_stock ?? item.stock_on_hand ?? 0);
			const raw = maxCap - availStock;
			// Skip items with no max capacity or no qty needed
			if (isNaN(maxCap) || raw <= 0) return [];
			quantity = Math.floor(raw);
		}

		// Rate: bill lookup first (if enabled), then purchase_rate, then selling rate
		const rate = billRateMap[item.item_id] ?? item.purchase_rate ?? item.rate ?? 0;

		const line = {
			item_id: item.item_id,
			name: item.name,
			quantity,
			rate,
		};

		if (item.unit) line.unit = item.unit;
		if (item.hsn_or_sac) line.hsn_or_sac = item.hsn_or_sac;
		if (item.purchase_account_id) line.account_id = item.purchase_account_id;

		const taxId = isInterstate
			? (item.tax_id_inter || item.tax_id)
			: (item.tax_id_intra || item.tax_id);
		if (taxId) line.tax_id = taxId;

		return [line];
	});

	const today = new Date().toISOString().split('T')[0];

	const body = { vendor_id: vendorId, date: today, line_items: lineItems };

	if (vendor.currency_id) body.currency_id = vendor.currency_id;
	if (vendor.gst_treatment) body.gst_treatment = vendor.gst_treatment;
	if (vendor.gst_no) body.gst_no = vendor.gst_no;
	// place_of_contact is the GST-authoritative state field; source_of_supply is a fallback
	const supplyState = vendor.place_of_contact || vendor.source_of_supply;
	if (supplyState) body.source_of_supply = supplyState;

	// Discount — percentage sent as "X%", flat amount sent as a number
	if (discount > 0) {
		body.discount = discountType === '%' ? `${discount}%` : discount;
		body.is_discount_before_tax = true;
		if (discountAccountId) body.discount_account_id = discountAccountId;
	}

	console.log('[createPO] payload →', JSON.stringify(body, null, 2));

	const url = `${BASE_PROXY}/purchaseorders?organization_id=${ORG_ID}`;
	const res = await fetchWithRetry(url, {
		method: 'POST',
		headers: { ...authHeaders(), 'content-type': 'application/json' },
		body: JSON.stringify(body),
	});

	const data = await res.json();
	console.log('[createPO] response →', JSON.stringify(data, null, 2));

	if (data.code !== 0) {
		throw new Error(data.message || 'Failed to create purchase order');
	}

	const po = data.purchaseorder;

	// Round off — fetch the real total from the created PO, compute the exact adjustment,
	// then PUT the PO back so the value is precise (not just 0).
	if (roundOff && po?.purchaseorder_id && po?.total != null) {
		const total = Number(po.total);
		const adjustment = parseFloat((Math.round(total) - total).toFixed(2));
		console.log('[createPO] round-off: total', total, '→ adjustment', adjustment);
		if (adjustment !== 0) {
			const putBody = { ...body, adjustment, adjustment_description: 'Round Off' };
			const putUrl = `${BASE_PROXY}/purchaseorders/${po.purchaseorder_id}?organization_id=${ORG_ID}`;
			const putRes = await fetchWithRetry(putUrl, {
				method: 'PUT',
				headers: { ...authHeaders(), 'content-type': 'application/json' },
				body: JSON.stringify(putBody),
			});
			const putData = await putRes.json();
			console.log('[createPO] round-off PUT →', putData.code, putData.message);
			// Return the updated PO if available, otherwise fall back to the created one
			if (putData.code === 0 && putData.purchaseorder) return putData.purchaseorder;
		}
	}

	return po;
}

// ─── MAIN EXPORT ─────────────────────────────────────────────────────────────

export const fetchItems = async (onProgress) => {
	const [lowStockItems, openPOItemIds] = await Promise.all([
		getLowStockItems(),
		getOpenPOItemIds(),
	]);

	const uncoveredItems = lowStockItems.filter(
		(item) => !openPOItemIds.has(item.item_id),
	);

	const processed = [];

	for (const item of uncoveredItems) {
		const enriched = await enrichSingleItem(item);
		processed.push(enriched);
		onProgress?.([...processed], uncoveredItems.length);
	}

	return processed;
};
