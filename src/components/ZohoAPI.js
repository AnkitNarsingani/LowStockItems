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
	// 2a. Fetch all open PO headers (paginated)
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

	// 2b. Fetch each PO's detail to get its line items, collect item_ids
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
			// If a single PO fetch fails, skip it — don't abort the whole process
		}
	}

	return coveredItemIds;
}

// ─── STEP 3: enrich a single item with vendor / brand / manufacturer ──────────

async function enrichSingleItem(item) {
	try {
		const url = `${BASE_ITEMS}/items/${item.item_id}?organization_id=${ORG_ID}`;
		const res = await fetchWithRetry(url, { headers: authHeaders() });
		const data = await res.json();

		await delay(300);

		return {
			...item,
			vendor_name: data.item.vendor_name || 'Unknown Vendor',
			brand: data.item.brand || 'Unknown Brand',
			manufacturer: data.item.manufacturer || 'Unknown Manufacturer',
		};
	} catch {
		return item;
	}
}

// ─── MAIN EXPORT ─────────────────────────────────────────────────────────────
//
// Flow:
//   1. Fetch low stock items + open PO item_ids in parallel
//   2. Remove any low stock item that already has an open PO
//   3. Enrich the remaining items one-by-one, streaming progress via onProgress

export const fetchItems = async (onProgress) => {
	// Run both fetches concurrently — they don't depend on each other
	const [lowStockItems, openPOItemIds] = await Promise.all([
		getLowStockItems(),
		getOpenPOItemIds(),
	]);

	// Filter out items already covered by an open PO
	const uncoveredItems = lowStockItems.filter(
		(item) => !openPOItemIds.has(item.item_id),
	);

	// Enrich remaining items and stream progress
	const processed = [];

	for (const item of uncoveredItems) {
		const enriched = await enrichSingleItem(item);
		processed.push(enriched);
		onProgress?.([...processed], uncoveredItems.length);
	}

	return processed;
};
