import { storeFor, json, preflight, keyFor } from './_lost-sales-shared.mjs';

// Backs the ACTIONS column on the lost-sales list.
export default async (req) => {
	if (req.method === 'OPTIONS') return preflight();
	if (req.method !== 'DELETE' && req.method !== 'POST') {
		return json(405, { error: 'Method not allowed. Use DELETE.' });
	}

	const params = new URL(req.url).searchParams;
	const id = params.get('id');
	const date = params.get('date');

	if (!id || !date) {
		return json(400, { error: 'Both id and date are required.' });
	}

	try {
		const store = storeFor();
		await store.delete(keyFor(date, id));
		return json(200, { deleted: id });
	} catch (e) {
		return json(502, { error: `Could not delete the lost sale: ${e.message || e}` });
	}
};
