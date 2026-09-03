// ─────────────────────────────────────────────────────────────────────────────
// One sales cache for the whole session.
//
// A sales figure for a given item and window never changes while you are using
// the app, so it should be fetched once and no more. Previously each page kept
// its own cache in component state, which meant:
//
//   • leaving the New PO page and coming back refetched everything;
//   • the reorder run and the PO preview each fetched the same 365-day figures
//     without knowing the other had them.
//
// Holding it here fixes both: the cache outlives any component, and the two
// features warm each other.
//
// In-flight requests are shared too, so two callers asking for the same figure
// at the same moment produce one request rather than two.
//
// Note that a 180-day and a 365-day figure are genuinely different numbers.
// The report returns a total for a period, not a series, so a shorter window
// cannot be derived from a longer one — Method 2's 180-day window and the
// 365-day window used elsewhere are two separate cache entries by necessity.
// ─────────────────────────────────────────────────────────────────────────────

import { getSalesForPeriod } from '../components/ZohoAPI';

const cache = new Map(); // `${itemId}:${days}` -> units sold
const inflight = new Map(); // `${itemId}:${days}` -> Promise

const keyFor = (itemId, days) => `${itemId}:${days}`;

export function hasSales(itemId, days) {
	return cache.has(keyFor(itemId, days));
}

/** Cached figure, or undefined. Never fetches. */
export function peekSales(itemId, days) {
	return cache.get(keyFor(itemId, days));
}

export async function getSales(itemId, days) {
	const key = keyFor(itemId, days);
	if (cache.has(key)) return cache.get(key);
	if (inflight.has(key)) return inflight.get(key);

	const p = getSalesForPeriod(itemId, days)
		.then((value) => {
			cache.set(key, value);
			inflight.delete(key);
			return value;
		})
		.catch((e) => {
			inflight.delete(key);
			throw e;
		});

	inflight.set(key, p);
	return p;
}

/** Which of these items still need fetching for a window. */
export function missingFor(itemIds, days) {
	return itemIds.filter((id) => !cache.has(keyFor(id, days)));
}

export function size() {
	return cache.size;
}

export function clear() {
	cache.clear();
	inflight.clear();
}
