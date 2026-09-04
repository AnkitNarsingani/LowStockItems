import { randomUUID } from 'node:crypto';
import {
	storeFor,
	json,
	preflight,
	keyFor,
	validate,
	cleanItems,
} from './_lost-sales-shared.mjs';
import { requireUser } from '../shared/auth/session.mjs';
import { jsonError } from '../shared/http.mjs';

export default async (req) => {
	if (req.method === 'OPTIONS') return preflight();

	// Every lost-sale endpoint is business data; a session is required.
	try {
		await requireUser(req);
	} catch (error) {
		return jsonError(error, req);
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

	const problems = validate(payload);
	if (problems.length) {
		return json(400, { error: problems.join(' '), problems });
	}

	const id = randomUUID();
	// One record per visit, holding every item that was asked for.
	const record = {
		id,
		created_at: new Date().toISOString(),
		date: payload.date,
		customer_id: payload.customer_id || null,
		customer_name: payload.customer_name || '',
		items: cleanItems(payload),
	};

	try {
		// getStore is called here, inside the handler — never at module scope.
		const store = storeFor();
		await store.setJSON(keyFor(record.date, id), record);
	} catch (e) {
		return json(502, { error: `Could not save the lost sale: ${e.message || e}` });
	}

	return json(201, { lost_sale: record });
};
