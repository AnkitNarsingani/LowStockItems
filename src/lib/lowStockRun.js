// ─────────────────────────────────────────────────────────────────────────────
// The low-stock item load, held outside React.
//
// fetchItems walks every low-stock item, filters out those already on an open
// PO, then enriches each one with a separate call — minutes of work on a real
// catalogue. Held in the page's own state it was thrown away on every
// navigation and started again on return.
//
// Keeping it here means the load continues while you are elsewhere, and coming
// back reattaches to it. Results are cached, so a second visit is instant.
//
// In memory only: a page reload starts over.
// ─────────────────────────────────────────────────────────────────────────────

import { fetchItems } from '../components/ZohoAPI';

const IDLE = {
	phase: 'idle', // idle | loading | done | error
	items: [],
	loaded: 0,
	total: 0,
	error: null,
};

let state = IDLE;
const listeners = new Set();
let running = false;
let token = 0;

function set(patch) {
	state = { ...state, ...patch };
	for (const fn of listeners) fn();
}

export function getState() {
	return state;
}

export function subscribe(fn) {
	listeners.add(fn);
	return () => listeners.delete(fn);
}

/**
 * Start a load, unless one is already running or has finished.
 *
 * `force` re-reads from Zoho — used after a PO is created, since the items on
 * it now have an open PO and should drop off the list. Without that the cache
 * would keep showing them.
 */
export async function startLoad({ force = false } = {}) {
	if (running) return;
	if (!force && state.phase === 'done') return;

	running = true;
	const mine = ++token;

	set({ phase: 'loading', items: [], loaded: 0, total: 0, error: null });

	try {
		let lastTotal = 0;
		await fetchItems((partial, total) => {
			if (mine !== token) return;
			lastTotal = total;
			set({ items: partial, loaded: partial.length, total });
		});

		if (mine !== token) return;
		set({ phase: 'done', loaded: state.items.length, total: lastTotal });
	} catch (e) {
		if (mine === token) {
			set({ phase: 'error', error: e.message || 'Could not load items.' });
		}
	} finally {
		if (mine === token) running = false;
	}
}

/** Drop the cache so the next visit re-reads from Zoho. */
export function invalidate() {
	token++;
	running = false;
	state = IDLE;
	for (const fn of listeners) fn();
}
