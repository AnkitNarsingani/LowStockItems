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
	// Strong consistency: the form saves and then immediately navigates to the
	// list, and under the default eventual consistency the new record takes a
	// few seconds to appear — so a save looks like it failed. Slower reads are
	// the right trade at these volumes.
	return getStore({ name: STORE_NAME, consistency: 'strong' });
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

const hasName = (it) =>
	!!(
		(it?.item_id && String(it.item_id).trim()) ||
		(it?.item_name && String(it.item_name).trim())
	);

/**
 * A quantity as it should be stored: a positive number, or null.
 *
 * Quantity is optional. "They asked for this and we had none" is worth
 * recording on its own, and forcing a number invites a made-up one — which
 * would then be totalled into demand as though it were observed.
 */
const qtyOrNull = (v) => {
	if (v == null || String(v).trim() === '') return null;
	const n = Number(v);
	return Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * The item lines of a payload, in the shape they are stored in.
 * Unnamed lines are dropped — the form always carries one blank row.
 */
export function cleanItems(payload) {
	const raw = Array.isArray(payload?.items) ? payload.items : [];
	return raw.filter(hasName).map((it) => ({
		item_id: it.item_id || null,
		item_name: String(it.item_name || '').trim(),
		is_free_text: !!it.is_free_text,
		qty_wanted: qtyOrNull(it.qty_wanted),
	}));
}

/**
 * One record now holds every item the customer asked for, so a visit is a
 * single row rather than one per item.
 *
 * Records written before that change are flat — one item on the record itself.
 * They are lifted into the same shape on the way out, so nothing has to be
 * migrated in place and an old record stays readable for ever.
 */
export function normalizeRecord(rec) {
	if (!rec || Array.isArray(rec.items)) return rec;
	return {
		...rec,
		items: hasName(rec)
			? [
					{
						item_id: rec.item_id || null,
						item_name: String(rec.item_name || '').trim(),
						is_free_text: !!rec.is_free_text,
						qty_wanted: qtyOrNull(rec.qty_wanted),
					},
				]
			: [],
	};
}

/**
 * Server-side validation — the UI validates too, but this is the boundary that
 * actually protects the store.
 * Returns an array of human-readable problems; empty means the payload is good.
 */
export function validate(payload) {
	const problems = [];

	const items = Array.isArray(payload?.items) ? payload.items.filter(hasName) : [];
	if (items.length === 0) problems.push('at least one item is required.');

	// A quantity may be left out, but one that was typed has to make sense —
	// silently discarding a "-3" would lose what the user meant to say.
	if (
		items.some((it) => {
			const q = it.qty_wanted;
			if (q == null || String(q).trim() === '') return false;
			const n = Number(q);
			return !Number.isFinite(n) || n <= 0;
		})
	) {
		problems.push('a quantity, where given, must be a number greater than zero.');
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

	return problems;
}
