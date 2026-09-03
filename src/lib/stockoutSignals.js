// Client for the stockout-signal endpoint (algorithm spec §A.5).
//
// Recording is best-effort and deliberately silent: it happens as a side effect
// of previewing a PO, and a failure to record must never interrupt that. The
// user is not doing this task and should not be told about its failures.

const ENDPOINT = '/.netlify/functions/stockout-signals';

/**
 * Fire-and-forget. Resolves to the number written, or 0 if anything went wrong.
 * Never rejects.
 */
export async function recordStockoutSignals(signals) {
	if (!Array.isArray(signals) || signals.length === 0) return 0;

	try {
		const res = await fetch(ENDPOINT, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ signals }),
		});
		if (!res.ok) return 0;
		const data = await res.json();
		return data?.written ?? 0;
	} catch {
		// Offline, endpoint absent under `npm start`, or the store is unavailable.
		return 0;
	}
}

export async function listStockoutSignals() {
	const res = await fetch(ENDPOINT);
	if (!res.ok) throw new Error(`Request failed (${res.status}).`);
	const data = await res.json();
	return data.signals || [];
}
