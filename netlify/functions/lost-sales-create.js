const { randomUUID } = require('crypto');
const { storeFor, CORS, json, keyFor, validate } = require('./_lost-sales-shared');

exports.handler = async function (event) {
	if (event.httpMethod === 'OPTIONS') {
		return { statusCode: 204, headers: CORS, body: '' };
	}
	if (event.httpMethod !== 'POST') {
		return json(405, { error: 'Method not allowed. Use POST.' });
	}

	let payload;
	try {
		payload = JSON.parse(event.body || '{}');
	} catch {
		return json(400, { error: 'Body must be valid JSON.' });
	}

	const problems = validate(payload);
	if (problems.length) {
		return json(400, { error: problems.join(' '), problems });
	}

	const id = randomUUID();
	const record = {
		id,
		created_at: new Date().toISOString(),
		date: payload.date,
		customer_id: payload.customer_id || null,
		customer_name: payload.customer_name || '',
		item_id: payload.item_id || null,
		item_name: payload.item_name || '',
		is_free_text: !!payload.is_free_text,
		qty_wanted: Number(payload.qty_wanted),
		note: payload.note ? String(payload.note) : null,
	};

	try {
		// getStore must be called in here — see _lost-sales-shared.js.
		const store = storeFor();
		await store.setJSON(keyFor(record.date, id), record);
	} catch (e) {
		return json(502, {
			error: `Could not save the lost sale: ${e.message || e}`,
		});
	}

	return json(201, { lost_sale: record });
};
