// Stockout-group signals — algorithm spec §A.5, build spec §3.5.
//
// When a PO selection is evaluated, any item at or below its reorder point
// whose siblings are >=50% at or above their max capacity is evidence that its
// reorder point and max capacity are set too low relative to the group.
//
// Write-only for now: nothing reads these yet. They are collected because they
// cannot be reconstructed later — the signal depends on the stock levels of a
// whole group at the moment the PO was raised, which Zoho does not retain.
//
// Functions v2 (ESM). The format is not cosmetic: Netlify injects the automatic
// Blobs configuration only for v2 handlers.

import { getStore } from '@netlify/blobs';

const STORE_NAME = 'stockout-signals';

const CORS = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Headers': 'Content-Type',
	'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
};

const json = (status, body) => Response.json(body, { status, headers: CORS });

function storeFor() {
	// Called inside the handler, never at module scope.
	return getStore({ name: STORE_NAME, consistency: 'strong' });
}

function isValidDate(s) {
	if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
	const d = new Date(`${s}T00:00:00Z`);
	return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/**
 * One key per item per day, rather than per evaluation.
 *
 * Previewing the same selection repeatedly would otherwise write a pile of
 * duplicates and make a much-previewed item look like a much-starved one.
 * Engine B cares that the condition held on a given day, not how many times
 * the user pressed the button.
 */
function keyFor(date, itemId) {
	return `signal:${String(date).slice(0, 7)}:${date}:${encodeURIComponent(itemId)}`;
}

function validate(s) {
	if (!s || typeof s !== 'object') return 'signal must be an object.';
	if (!s.item_id || !String(s.item_id).trim()) return 'item_id is required.';
	if (!isValidDate(s.date)) return 'date must be YYYY-MM-DD.';
	if (!Number.isFinite(Number(s.on_hand))) return 'on_hand must be a number.';
	if (!Number.isFinite(Number(s.siblings_full_count))) {
		return 'siblings_full_count must be a number.';
	}
	if (!Number.isFinite(Number(s.group_size))) {
		return 'group_size must be a number.';
	}
	return null;
}

export default async (req) => {
	if (req.method === 'OPTIONS') {
		return new Response(null, { status: 204, headers: CORS });
	}

	if (req.method === 'GET') {
		// Nothing in the app calls this yet; it exists so the accumulated signal
		// can be inspected, and for Engine B to read later.
		try {
			const store = storeFor();
			const { blobs } = await store.list({ prefix: 'signal:' });
			const out = [];
			for (const b of blobs) {
				const rec = await store.get(b.key, { type: 'json' });
				if (rec) out.push(rec);
			}
			out.sort((a, b) => String(b.date).localeCompare(String(a.date)));
			return json(200, { signals: out, count: out.length });
		} catch (e) {
			return json(502, { error: `Could not read signals: ${e.message || e}` });
		}
	}

	if (req.method !== 'POST') {
		return json(405, { error: 'Method not allowed. Use POST.' });
	}

	let payload;
	try {
		payload = await req.json();
	} catch {
		return json(400, { error: 'Body must be valid JSON.' });
	}

	const signals = Array.isArray(payload?.signals) ? payload.signals : [];
	if (signals.length === 0) return json(200, { written: 0 });
	if (signals.length > 500) {
		return json(400, { error: 'Too many signals in one request.' });
	}

	for (const s of signals) {
		const problem = validate(s);
		if (problem) return json(400, { error: problem });
	}

	try {
		const store = storeFor();
		const now = new Date().toISOString();
		let written = 0;

		for (const s of signals) {
			await store.setJSON(keyFor(s.date, s.item_id), {
				item_id: String(s.item_id),
				date: s.date,
				on_hand: Number(s.on_hand),
				siblings_full_count: Number(s.siblings_full_count),
				group_size: Number(s.group_size),
				recorded_at: now,
			});
			written++;
		}

		return json(201, { written });
	} catch (e) {
		return json(502, { error: `Could not record signals: ${e.message || e}` });
	}
};
