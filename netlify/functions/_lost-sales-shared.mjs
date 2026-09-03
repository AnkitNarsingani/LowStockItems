// Shared helpers for the lost-sale endpoints.
//
// These are Netlify Functions v2 (ESM, `export default`, Request/Response).
// The format matters: Netlify only injects NETLIFY_BLOBS_CONTEXT — the
// automatic Blobs configuration — for v2 functions. Under the legacy
// `exports.handler` format getStore() throws MissingBlobsEnvironmentError,
// which is exactly what happened on the first deploy of this module.
//
// getStore is still only ever called inside a handler, never at module scope.

import { getStore } from '@netlify/blobs';

const STORE_NAME = 'lost-sales';

export function storeFor() {
	return getStore(STORE_NAME);
}

const CORS = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Headers': 'Content-Type',
	'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
};

export function json(status, body) {
	return Response.json(body, { status, headers: CORS });
}

export function preflight() {
	return new Response(null, { status: 204, headers: CORS });
}

// Key scheme: lost-sale:{YYYY-MM}:{uuid} so a month can be listed by prefix
// without scanning the whole store.
export function keyFor(date, id) {
	return `lost-sale:${String(date).slice(0, 7)}:${id}`;
}

export function isValidDate(s) {
	if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
	const d = new Date(`${s}T00:00:00Z`);
	if (Number.isNaN(d.getTime())) return false;
	// Round-trip guards against 2026-02-31 parsing into March.
	return d.toISOString().slice(0, 10) === s;
}

/**
 * Server-side validation — the UI validates too, but this is the boundary that
 * actually protects the store.
 * Returns an array of human-readable problems; empty means the payload is good.
 */
export function validate(payload) {
	const problems = [];

	const qty = Number(payload?.qty_wanted);
	if (!Number.isFinite(qty) || qty <= 0) {
		problems.push('qty_wanted must be a number greater than zero.');
	}

	if (!isValidDate(payload?.date)) {
		problems.push('date must be a real calendar date in YYYY-MM-DD form.');
	} else {
		// The function runs in UTC while the people using it are in IST (+5:30),
		// so between midnight and 05:30 local their "today" is still yesterday by
		// UTC — comparing against the server's own date rejects a perfectly
		// ordinary entry. Allowing one day of slack covers every timezone ahead
		// of UTC. The client already limits the picker to the user's local today.
		const limit = new Date(Date.now() + 24 * 3600 * 1000)
			.toISOString()
			.slice(0, 10);
		if (payload.date > limit) problems.push('date cannot be in the future.');
	}

	const hasItem =
		(payload?.item_id && String(payload.item_id).trim()) ||
		(payload?.item_name && String(payload.item_name).trim());
	if (!hasItem) problems.push('either item_id or item_name is required.');

	return problems;
}
