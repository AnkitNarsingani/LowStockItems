const { storeFor, CORS, json, isValidDate } = require('./_lost-sales-shared');

// Months between two YYYY-MM-DD bounds, inclusive, as YYYY-MM prefixes. Lets a
// bounded query list only the months it needs instead of the whole store.
function monthsBetween(from, to) {
	const out = [];
	let [y, m] = from.slice(0, 7).split('-').map(Number);
	const [ey, em] = to.slice(0, 7).split('-').map(Number);
	// Guard against a reversed range spinning forever.
	for (let i = 0; i < 600; i++) {
		if (y > ey || (y === ey && m > em)) break;
		out.push(`${y}-${String(m).padStart(2, '0')}`);
		m++;
		if (m > 12) {
			m = 1;
			y++;
		}
	}
	return out;
}

exports.handler = async function (event) {
	if (event.httpMethod === 'OPTIONS') {
		return { statusCode: 204, headers: CORS, body: '' };
	}
	if (event.httpMethod !== 'GET') {
		return json(405, { error: 'Method not allowed. Use GET.' });
	}

	const q = event.queryStringParameters || {};
	const { from, to, item_id: itemId } = q;

	if (from && !isValidDate(from)) {
		return json(400, { error: 'from must be a date in YYYY-MM-DD form.' });
	}
	if (to && !isValidDate(to)) {
		return json(400, { error: 'to must be a date in YYYY-MM-DD form.' });
	}

	try {
		const store = storeFor();

		// With both bounds we can list month by month; otherwise list everything.
		const prefixes =
			from && to
				? monthsBetween(from, to).map((m) => `lost-sale:${m}:`)
				: ['lost-sale:'];

		const keys = [];
		for (const prefix of prefixes) {
			const { blobs } = await store.list({ prefix });
			for (const b of blobs) keys.push(b.key);
		}

		const records = [];
		for (const key of keys) {
			const rec = await store.get(key, { type: 'json' });
			if (!rec) continue;
			if (from && rec.date < from) continue;
			if (to && rec.date > to) continue;
			if (itemId && rec.item_id !== itemId) continue;
			records.push(rec);
		}

		// Newest first — most recent entries are the ones being reviewed.
		records.sort((a, b) =>
			a.date === b.date
				? String(b.created_at).localeCompare(String(a.created_at))
				: String(b.date).localeCompare(String(a.date)),
		);

		return json(200, { lost_sales: records, count: records.length });
	} catch (e) {
		return json(502, {
			error: `Could not read lost sales: ${e.message || e}`,
		});
	}
};
