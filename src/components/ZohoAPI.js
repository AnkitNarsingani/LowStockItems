export const fetchItems = async () => {
	const lowStockItems = await GetLowStockItems();
	const pendingPOs = await GetPendingPurchaseOrders();

	const pendingPOItemIds = new Set();
	pendingPOs.forEach((po) => {
		(po.line_items || []).forEach((li) => {
			if (li.item_id) pendingPOItemIds.add(li.item_id);
		});
	});

	const filteredLowStock = lowStockItems.filter(
		(item) => !pendingPOItemIds.has(item.item_id)
	);

	return filteredLowStock;
};

async function GetLowStockItems() {
	let page = 1;
	let allItems = [];
	let hasMore = true;
	const per_page = 200;
	const accessToken =
		'1000.a6e6445cbc7e9f4433dbb41a9aa02109.4d5ae3d30dc6f28084a109e941aecff2';
	const baseUrl =
		'https://www.zohoapis.in/books/v3/items?organization_id=60013163918&filter_by=Status.Lowstock';

	// Build query params string
	while (hasMore) {
		const url = `${baseUrl}&page=${page}&per_page=${per_page}`;
		const res = await fetch(url, {
			headers: {
				Authorization: `Zoho-oauthtoken ${accessToken}`,
				'Content-Type': 'application/json',
			},
			credentials: 'omit',
		});

		if (!res.ok) throw new Error(`API error: ${res.status} ${res.statusText}`);
		const data = await res.json();

		if (!Array.isArray(data.items))
			throw new Error('Unexpected response format');
		allItems = allItems.concat(data.items);
		hasMore = data.page_context && data.page_context.has_more_page;
		page += 1;
	}

	return allItems;
}

async function GetPendingPurchaseOrders() {
	const accessToken =
		'1000.a6e6445cbc7e9f4433dbb41a9aa02109.4d5ae3d30dc6f28084a109e941aecff2';
	const per_page = 200;
	let allPOs = [];
	let page = 1,
		hasMore = true;

	while (hasMore) {
		const url = `https://www.zohoapis.in/books/v3/purchaseorders?organization_id=60013163918&filter_by=Status.Open&page=${page}&per_page=${per_page}`;
		const res = await fetch(url, {
			headers: {
				Authorization: `Zoho-oauthtoken ${accessToken}`,
				'Content-Type': 'application/json',
			},
			credentials: 'omit',
		});
		if (!res.ok) throw new Error(`API error: ${res.status} ${res.statusText}`);
		const data = await res.json();
		allPOs = allPOs.concat(data.purchaseorders || []);
		hasMore = data.page_context && data.page_context.has_more_page;
		page += 1;
	}

	async function fetchPODetails(poId) {
		const url = `https://www.zohoapis.in/books/v3/purchaseorders/${poId}?organization_id=60013163918`;
		const res = await fetch(url, {
			headers: {
				Authorization: `Zoho-oauthtoken ${accessToken}`,
				'Content-Type': 'application/json',
			},
			credentials: 'omit',
		});
		if (!res.ok) throw new Error(`API error: ${res.status} ${res.statusText}`);
		const data = await res.json();
		return data.purchaseorder;
	}

	const concurrency = 5; // Number of parallel requests at a time (tune as needed)
	let results = [];
	for (let i = 0; i < allPOs.length; i += concurrency) {
		const chunk = allPOs.slice(i, i + concurrency);
		const chunkResults = await Promise.all(
			chunk.map((po) => fetchPODetails(po.purchaseorder_id))
		);
		results = results.concat(chunkResults);
	}

	return results;
}
