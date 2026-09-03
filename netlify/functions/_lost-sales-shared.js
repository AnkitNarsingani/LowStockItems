// Shared helpers for the lost-sale endpoints.
//
// NOTE: getStore is deliberately NOT called here at module scope. Doing that
// throws MissingBlobsEnvironmentError in production — siteID and token are only
// injected once a handler is running. Every handler calls storeFor() itself.

const STORE_NAME = 'lost-sales';

function storeFor() {
	// Required inside the handler, not at module load. See note above.
	const { getStore } = require('@netlify/blobs');

	// Netlify injects NETLIFY_BLOBS_CONTEXT automatically, but only for deploys
	// its own build system produced. A prebuilt CLI upload does not get it, so
	// fall back to explicit credentials when they are configured.
	if (!process.env.NETLIFY_BLOBS_CONTEXT) {
		const siteID = process.env.BLOBS_SITE_ID || process.env.SITE_ID;
		const token = process.env.NETLIFY_BLOBS_TOKEN;
		if (siteID && token) return getStore({ name: STORE_NAME, siteID, token });
	}

	return getStore(STORE_NAME);
}

const CORS = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Headers': 'Content-Type',
	'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
};

function json(statusCode, body) {
	return {
		statusCode,
		headers: { ...CORS, 'Content-Type': 'application/json' },
		body: JSON.stringify(body),
	};
}

// Key scheme: lost-sale:{YYYY-MM}:{uuid} so a month can be listed by prefix
// without scanning the whole store.
function keyFor(date, id) {
	return `lost-sale:${String(date).slice(0, 7)}:${id}`;
}

function isValidDate(s) {
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
function validate(payload) {
	const problems = [];

	const qty = Number(payload?.qty_wanted);
	if (!Number.isFinite(qty) || qty <= 0) {
		problems.push('qty_wanted must be a number greater than zero.');
	}

	if (!isValidDate(payload?.date)) {
		problems.push('date must be a real calendar date in YYYY-MM-DD form.');
	} else {
		// Compare date-only strings so a client in a timezone ahead of the server
		// is not rejected for "today".
		const today = new Date().toISOString().slice(0, 10);
		if (payload.date > today) problems.push('date cannot be in the future.');
	}

	const hasItem =
		(payload?.item_id && String(payload.item_id).trim()) ||
		(payload?.item_name && String(payload.item_name).trim());
	if (!hasItem) problems.push('either item_id or item_name is required.');

	return problems;
}

module.exports = { STORE_NAME, storeFor, CORS, json, keyFor, isValidDate, validate };
