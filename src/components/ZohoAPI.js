const getAccessToken = () => localStorage.getItem('accessToken');

const delay = (ms) => new Promise((res) => setTimeout(res, ms));

async function fetchWithRetry(url, options, retries = 3) {
	for (let i = 0; i < retries; i++) {
		const res = await fetch(url, options);

		if (res.status !== 429) return res;

		const waitTime = (i + 1) * 1000;
		await delay(waitTime);
	}

	throw new Error('Max retries exceeded (429)');
}

// 🔥 MAIN FUNCTION (STREAMING ENABLED)
export const fetchItems = async (onProgress) => {
	const lowStockItems = await GetLowStockItems();

	let processed = [];

	for (let i = 0; i < lowStockItems.length; i++) {
		const enriched = await enrichSingleItem(lowStockItems[i]);

		processed.push(enriched);

		// 🔥 push incremental update
		onProgress?.([...processed], lowStockItems.length);
	}

	return processed;
};

async function GetLowStockItems() {
	let page = 1;
	let allItems = [];
	let hasMore = true;
	const per_page = 100;

	const baseUrl =
		'/zoho/books/v3/items?organization_id=60013163918&filter_by=Status.Lowstock';

	while (hasMore) {
		const url = `${baseUrl}&page=${page}&per_page=${per_page}`;

		const res = await fetchWithRetry(url, {
			headers: {
				Authorization: `Zoho-oauthtoken ${getAccessToken()}`,
			},
		});

		const data = await res.json();

		allItems = allItems.concat(data.items || []);
		hasMore = data.page_context?.has_more_page;
		page++;

		await delay(300);
	}

	return allItems;
}

async function enrichSingleItem(item) {
	try {
		const res = await fetchWithRetry(
			`/zoho/books/v3/items/${item.item_id}?organization_id=60013163918`,
			{
				headers: {
					Authorization: `Zoho-oauthtoken ${getAccessToken()}`,
				},
			},
		);

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
