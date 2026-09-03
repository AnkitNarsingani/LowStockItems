// Client for the lost-sale Netlify Functions.
//
// These endpoints only exist when the site is served by Netlify. Under CRA's
// own dev server the paths 404 and come back as the HTML fallback, so a
// non-JSON body is reported as an unreachable service rather than surfacing a
// raw "Unexpected token < in JSON".

const BASE = '/.netlify/functions';

const UNREACHABLE = 'Could not reach the lost-sale service.';

async function call(path, options) {
	let res;
	try {
		res = await fetch(`${BASE}/${path}`, options);
	} catch {
		throw new Error(UNREACHABLE);
	}

	const text = await res.text();
	let data = null;
	try {
		data = text ? JSON.parse(text) : null;
	} catch {
		// A non-JSON body means the function was never hit.
		throw new Error(UNREACHABLE);
	}

	if (!res.ok) {
		throw new Error(data?.error || `Request failed (${res.status}).`);
	}
	return data;
}

export async function createLostSale(record) {
	const data = await call('lost-sales-create', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(record),
	});
	return data.lost_sale;
}

export async function listLostSales({ from, to, itemId } = {}) {
	const params = new URLSearchParams();
	if (from) params.set('from', from);
	if (to) params.set('to', to);
	if (itemId) params.set('item_id', itemId);
	const qs = params.toString();
	const data = await call(`lost-sales-list${qs ? `?${qs}` : ''}`);
	return data.lost_sales || [];
}

/**
 * `originalDate` is the date the record is stored under, which is not
 * necessarily the new one — the key embeds the month, so the endpoint needs
 * both to move the record when the date changes.
 */
export async function updateLostSale(record) {
	const data = await call('lost-sales-update', {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(record),
	});
	return data.lost_sale;
}

export async function deleteLostSale({ id, date }) {
	const params = new URLSearchParams({ id, date });
	return call(`lost-sales-delete?${params.toString()}`, { method: 'DELETE' });
}
