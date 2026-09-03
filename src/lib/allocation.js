// ─────────────────────────────────────────────────────────────────────────────
// PO allocation engine — Engine A, methods 3–6.
//
// Implements LowStockItems-Algorithm-Spec.md §A.1–§A.3. Methods 1 (Simple) and
// 2 (Bundle, velocity weighted) are NOT here: they are the pre-existing
// behaviour and live untouched in ZohoAPI.js. See docs/ for the spec.
//
// Everything in this file is pure and synchronous — sales figures are passed
// in, never fetched. That keeps the preview cheap and testable.
// ─────────────────────────────────────────────────────────────────────────────

export const METHODS = {
	SIMPLE: 'simple',
	BUNDLE_VELOCITY: 'bundle_velocity',
	BUNDLE_DAMPED: 'bundle_damped',
	COVER_DAYS: 'cover_days',
	COVER_BUNDLE: 'cover_bundle',
	SIMPLE_BALANCE: 'simple_balance',
};

export const DEFAULT_DAMPING_EXPONENT = 0.5;
export const DEFAULT_COVER_DAYS = 60;
export const SALES_WINDOW_DAYS = 365;

// ─── §A.1 Shared subroutines ─────────────────────────────────────────────────

/**
 * APPORTION(weights, B) — largest-remainder (Hamilton) apportionment.
 * Returns integers summing to exactly floor(B). Never naive round(), which
 * drifts off the target total.
 */
export function apportion(weights, total) {
	const n = weights.length;
	if (n === 0) return [];

	const B = Math.floor(total);
	if (B <= 0) return weights.map(() => 0);

	// All-zero (or non-finite) weights degrade to an equal split.
	const clean = weights.map((w) => (Number.isFinite(w) && w > 0 ? w : 0));
	const sum = clean.reduce((s, w) => s + w, 0);
	const w = sum > 0 ? clean : clean.map(() => 1);
	const T = sum > 0 ? sum : n;

	const exact = w.map((x) => (x / T) * B);
	const base = exact.map(Math.floor);

	let remainder = B - base.reduce((s, v) => s + v, 0);

	// Hand the leftover units to the largest fractional remainders, ties by index.
	const order = exact
		.map((v, i) => ({ i, frac: v - Math.floor(v) }))
		.sort((a, b) => b.frac - a.frac || a.i - b.i);

	for (let k = 0; remainder > 0; k++, remainder--) {
		base[order[k % n].i] += 1;
	}

	return base;
}

/**
 * CLAMP_AND_REDISTRIBUTE(alloc, headroom, B) — water-filling.
 * Pushes anything above an item's headroom back out across the items that
 * still have room, in proportion to their weights (equally if all are 0).
 */
export function clampAndRedistribute(alloc, headroom, weights) {
	const a = alloc.slice();

	// Each pass strictly reduces total spill; the guard is belt and braces
	// against pathological float input.
	for (let pass = 0; pass < 1000; pass++) {
		let spill = 0;
		for (let i = 0; i < a.length; i++) {
			if (a[i] > headroom[i]) {
				spill += a[i] - headroom[i];
				a[i] = headroom[i];
			}
		}
		if (spill <= 0) break;

		const eligible = [];
		for (let i = 0; i < a.length; i++) {
			if (a[i] < headroom[i]) eligible.push(i);
		}
		if (eligible.length === 0) break; // cannot place the remainder

		const add = apportion(
			eligible.map((i) => weights[i]),
			spill,
		);
		for (let k = 0; k < eligible.length; k++) a[eligible[k]] += add[k];
	}

	return a;
}

/**
 * APPLY_MIN_FLOOR(alloc) — raise non-zero lines to their minimum order qty.
 * When the method has a fixed total B, the units added are reclaimed by
 * decrementing the largest allocations one at a time, never taking an item
 * below its own min_i and never below 0.
 */
export function applyMinFloor(alloc, minQty, headroom, fixedTotal = null) {
	const a = alloc.slice();
	let added = 0;

	for (let i = 0; i < a.length; i++) {
		if (a[i] > 0 && a[i] < minQty[i] && headroom[i] >= minQty[i]) {
			added += minQty[i] - a[i];
			a[i] = minQty[i];
		}
	}

	if (fixedTotal == null || added <= 0) return a;

	let need = added;
	while (need > 0) {
		let best = -1;
		for (let i = 0; i < a.length; i++) {
			// An item may only give a unit back if that keeps it at or above its
			// own floor (min_i while it holds stock, otherwise 0).
			const floorI = a[i] > 0 && minQty[i] > 0 ? minQty[i] : 0;
			if (a[i] - 1 < floorI) continue;
			if (best === -1 || a[i] > a[best]) best = i;
		}
		if (best === -1) break; // nothing left that can legally give a unit back
		a[best] -= 1;
		need -= 1;
	}

	return a;
}

// ─── Row derivation ──────────────────────────────────────────────────────────

/**
 * Normalise a PO line into the numbers the allocation maths needs.
 * `sold` is trailing-365-day units, supplied by the caller.
 *
 * Free-text lines are excluded from every method by the caller — they carry no
 * velocity, no share and no headroom, and only ever take a typed quantity.
 */
export function deriveRow(line, sold, overrideMaxCapacity = false) {
	const onHand = Number(line.available_stock ?? line.stock_on_hand ?? 0) || 0;
	const rawMax = Number(line.cf_maximum_capacity);
	const max = Number.isNaN(rawMax) ? 0 : rawMax;

	// The true top-up, independent of the override toggle. Method 6 starts here.
	const topUp = Math.max(0, max - onHand);

	return {
		item_id: line.item_id,
		name: line.name,
		isFreeText: !!line.isFreeText,
		onHand,
		max,
		reorder: line.reorder_level ?? null,
		sold: Number(sold) || 0,
		velocity: (Number(sold) || 0) / SALES_WINDOW_DAYS,
		minQty: Number(line.minimum_order_quantity) || 0,
		topUp,
		headroom: overrideMaxCapacity ? Infinity : topUp,
	};
}

// ─── §A.2 Methods 3–6 ────────────────────────────────────────────────────────
//
// Numbering note: the UI numbers these 3–6; the algorithm spec numbers the
// same four 2–5. Each function is labelled with both.

/** UI method 3 / spec §A.2.2 — Bundle, damped size-curve. */
function bundleDamped(rows, bundleTotal, exponent) {
	const anySold = rows.some((r) => r.sold > 0);
	// "if all sold_i == 0, w_i = 1 for all"
	const weights = anySold
		? rows.map((r) => Math.pow(r.sold, exponent))
		: rows.map(() => 1);

	const headroom = rows.map((r) => r.headroom);
	const qty = apportion(weights, bundleTotal);
	return clampAndRedistribute(qty, headroom, weights);
}

/** UI method 4 / spec §A.2.3 — Cover-duration (target days). No fixed total. */
function coverDays(rows, days) {
	return rows.map((r) => {
		const want = Math.max(0, Math.round(r.velocity * days) - r.onHand);
		return Math.min(want, r.headroom);
	});
}

/** UI method 5 / spec §A.2.4 — Cover-duration shape fitted to a bundle total. */
function coverFittedToBundle(rows, bundleTotal, days, exponent) {
	const raw = rows.map((r) => Math.max(0, r.velocity * days - r.onHand));
	const rawSum = raw.reduce((s, v) => s + v, 0);

	// "if sum(raw) == 0: fall back to method 2 weights" — the spec's method 2 is
	// the damped size-curve, i.e. sold^e.
	let weights = raw;
	if (rawSum === 0) {
		const anySold = rows.some((r) => r.sold > 0);
		weights = anySold
			? rows.map((r) => Math.pow(r.sold, exponent))
			: rows.map(() => 1);
	}

	const headroom = rows.map((r) => r.headroom);
	const qty = apportion(weights, bundleTotal);
	return clampAndRedistribute(qty, headroom, weights);
}

/** UI method 6 / spec §A.2.5 — Simple, then close the gap to B equally. */
function simpleBalanceToBundle(rows, bundleTotal) {
	// The starting point is always the real top-up; the override toggle only
	// lifts the ceiling that additions are clamped against.
	const cap = rows.map((r) => r.headroom);
	const alloc = rows.map((r) => r.topUp);
	let diff = bundleTotal - alloc.reduce((s, v) => s + v, 0);

	for (let pass = 0; pass < 1000; pass++) {
		const eligible = [];
		for (let i = 0; i < alloc.length; i++) {
			if (diff > 0 && alloc[i] < cap[i]) eligible.push(i);
			else if (diff < 0 && alloc[i] > 0) eligible.push(i);
		}
		if (eligible.length === 0 || Math.abs(diff) < 1) break;

		const per = diff / eligible.length;
		for (const i of eligible) {
			alloc[i] = Math.min(Math.max(alloc[i] + per, 0), cap[i]);
		}
		diff = bundleTotal - alloc.reduce((s, v) => s + v, 0);
	}

	const qty = apportion(alloc, bundleTotal);
	// Safety net only: a no-op whenever the loop converged. It bites solely in
	// the degenerate case where the group's total headroom is below B, where
	// apportioning to B would otherwise breach max capacity.
	return clampAndRedistribute(qty, cap, alloc);
}

// ─── Public entry point for methods 3–6 ──────────────────────────────────────

/**
 * Allocate quantities across `rows` (already derived via deriveRow).
 * Applies §A.3 post-processing: min-order floor, then integer, non-negative.
 *
 * Returns an array of integers parallel to `rows`.
 */
export function allocate(
	rows,
	{ method, bundleTotal, exponent, coverDays: days },
) {
	if (rows.length === 0) return [];

	const e = Number.isFinite(exponent) ? exponent : DEFAULT_DAMPING_EXPONENT;
	const B = Math.floor(Number(bundleTotal) || 0);
	const D = Number(days) || 0;

	let qty;
	let fixedTotal = null;

	switch (method) {
		case METHODS.BUNDLE_DAMPED:
			qty = bundleDamped(rows, B, e);
			fixedTotal = B;
			break;
		case METHODS.COVER_DAYS:
			qty = coverDays(rows, D);
			break;
		case METHODS.COVER_BUNDLE:
			qty = coverFittedToBundle(rows, B, D, e);
			fixedTotal = B;
			break;
		case METHODS.SIMPLE_BALANCE:
			qty = simpleBalanceToBundle(rows, B);
			fixedTotal = B;
			break;
		default:
			throw new Error(`allocate(): unsupported method "${method}"`);
	}

	// §A.3 post-processing
	qty = applyMinFloor(
		qty,
		rows.map((r) => r.minQty),
		rows.map((r) => r.headroom),
		fixedTotal,
	);

	return qty.map((q) => Math.max(0, Math.round(q)));
}

// ─── §A.5 Stockout signal emission ───────────────────────────────────────────

/**
 * For each item at or below its reorder point whose siblings are >=50% at or
 * above their max capacity, emit a signal. Evidence that the item's reorder
 * point and max capacity are set too low relative to its siblings.
 *
 * Pure — the caller decides whether to persist. Nothing consumes these yet
 * (Engine B is out of scope), but the data cannot be reconstructed later.
 */
export function emitStockoutSignals(
	rows,
	date = new Date().toISOString().slice(0, 10),
) {
	const signals = [];
	const groupSize = rows.length;

	for (const r of rows) {
		if (r.isFreeText) continue;
		if (r.reorder == null || !(r.onHand <= Number(r.reorder))) continue;

		const siblings = rows.filter((s) => s !== r);
		if (siblings.length < 2) continue;

		const full = siblings.filter((s) => s.max > 0 && s.onHand >= s.max).length;
		if (full / siblings.length < 0.5) continue;

		signals.push({
			item_id: r.item_id,
			date,
			on_hand: r.onHand,
			siblings_full_count: full,
			group_size: groupSize,
		});
	}

	return signals;
}
