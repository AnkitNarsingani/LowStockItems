const { storeFor, CORS, json, keyFor } = require('./_lost-sales-shared');

// Backs the ACTIONS column on the lost-sales list. Not in the build spec's two
// endpoints, but a mistyped record is otherwise permanent, and these records
// feed the reorder engine later.
exports.handler = async function (event) {
	if (event.httpMethod === 'OPTIONS') {
		return { statusCode: 204, headers: CORS, body: '' };
	}
	if (event.httpMethod !== 'DELETE' && event.httpMethod !== 'POST') {
		return json(405, { error: 'Method not allowed. Use DELETE.' });
	}

	const q = event.queryStringParameters || {};
	const id = q.id;
	const date = q.date;

	if (!id || !date) {
		return json(400, { error: 'Both id and date are required.' });
	}

	try {
		const store = storeFor();
		await store.delete(keyFor(date, id));
		return json(200, { deleted: id });
	} catch (e) {
		return json(502, {
			error: `Could not delete the lost sale: ${e.message || e}`,
		});
	}
};
