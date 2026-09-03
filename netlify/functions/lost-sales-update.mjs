import { storeFor, json, preflight, keyFor, validate } from './_lost-sales-shared.mjs';

/**
 * Update one lost sale.
 *
 * The blob key embeds the record's month (lost-sale:{YYYY-MM}:{uuid}), so
 * changing the date to another month changes where the record lives. The
 * original date therefore has to be supplied alongside the new one, and the
 * old key is removed after the new one is written — never before, so a failure
 * midway leaves the record present rather than lost.
 */
export default async (req) => {
	if (req.method === 'OPTIONS') return preflight();
	if (req.method !== 'PUT' && req.method !== 'POST') {
		return json(405, { error: 'Method not allowed. Use PUT.' });
	}

	let payload;
	try {
		payload = await req.json();
	} catch {
		return json(400, { error: 'Body must be valid JSON.' });
	}

	const id = payload?.id;
	const originalDate = payload?.original_date;
	if (!id || !originalDate) {
		return json(400, { error: 'Both id and original_date are required.' });
	}

	const problems = validate(payload);
	if (problems.length) {
		return json(400, { error: problems.join(' '), problems });
	}

	try {
		const store = storeFor();
		const oldKey = keyFor(originalDate, id);

		const existing = await store.get(oldKey, { type: 'json' });
		if (!existing) {
			return json(404, { error: 'That lost sale no longer exists.' });
		}

		const record = {
			...existing,
			date: payload.date,
			customer_id: payload.customer_id || null,
			customer_name: payload.customer_name || '',
			item_id: payload.item_id || null,
			item_name: payload.item_name || '',
			is_free_text: !!payload.is_free_text,
			qty_wanted: Number(payload.qty_wanted),
			note: payload.note ? String(payload.note) : null,
			updated_at: new Date().toISOString(),
		};

		const newKey = keyFor(record.date, id);
		await store.setJSON(newKey, record);
		if (newKey !== oldKey) await store.delete(oldKey);

		return json(200, { lost_sale: record });
	} catch (e) {
		return json(502, { error: `Could not update the lost sale: ${e.message || e}` });
	}
};
