// ─────────────────────────────────────────────────────────────────────────────
// Engine B — reorder-point and max-capacity suggestions.
//
// Implements LowStockItems-Algorithm-Spec.md §B.0–B.6. Pure and synchronous:
// every figure it needs is passed in, so it can be tested without Zoho.
//
// Running today means running the spec's stage 2 ("Data dependency — stock
// history"). Zoho exposes no daily stock series, and the nightly snapshot that
// would build one does not exist yet, so:
//
//   • days_in_stock is 365 — no censoring correction, which makes estimate A
//     the plain sales rate and keeps every proposal conservative;
//   • confidence is 'low' for every row, as the spec directs, until snapshots
//     accumulate;
//   • sigma comes from the spec's own <8-buckets fallback, because the sales
//     report returns a total for a period rather than a weekly series and
//     bucketing it would cost 52 API calls per item.
//
// Each of those is the spec's documented fallback, not an invention. As real
// history arrives, the inputs improve and the maths here does not change.
// ─────────────────────────────────────────────────────────────────────────────

/** §B.0 — service level to the safety factor Z. */
const Z_BY_SERVICE_LEVEL = {
	90: 1.28,
	95: 1.65,
	97: 1.88,
	98: 2.05,
	99: 2.33,
};

/** §B.0 — user-controlled settings and their defaults. */
export const DEFAULT_SETTINGS = {
	service_level: 95, // → Z
	aggressiveness: 50, // damping, as a percentage → f
	materiality_pct: 15, // suppress small changes
	materiality_abs: 2, // suppress small changes (units)
	min_history_days: 60, // below this, no suggestion
	default_lead_time: 21, // days, when vendor PO history is thin
	max_change_factor: 3, // hard bound per pass
};

export function zFor(serviceLevel) {
	return Z_BY_SERVICE_LEVEL[Number(serviceLevel)] ?? Z_BY_SERVICE_LEVEL[95];
}

const DEFAULT_ORDER_CYCLE_DAYS = 30; // §B.3 fallback when < 3 POs
const WINDOW_DAYS = 365;

/**
 * @typedef {Object} EngineInput
 * @property {string} item_id
 * @property {string} item_name
 * @property {number} current_rop        current reorder_level
 * @property {number} current_max        current cf_maximum_capacity
 * @property {number} sold               units sold, trailing 365 days
 * @property {number} lost_units         logged lost-sale units, trailing 365
 * @property {number} lost_sales_count   number of logged lost sales
 * @property {number|null} days_in_stock null until snapshots exist
 * @property {number|null} history_days  age of the item in days, if known
 * @property {number|null} lead_time     from vendor PO history, if known
 * @property {number|null} order_cycle_days
 */

/**
 * §B.1–B.6. Returns a suggestion, or null when the item is ineligible or every
 * proposed change was suppressed as immaterial.
 */
export function computeSuggestion(input, settings = DEFAULT_SETTINGS) {
	const s = { ...DEFAULT_SETTINGS, ...settings };

	const currentRop = Number(input.current_rop) || 0;
	const currentMax = Number(input.current_max) || 0;
	const sold = Number(input.sold) || 0;
	const lostUnits = Number(input.lost_units) || 0;

	// ── B.5 step 1: ELIGIBILITY ────────────────────────────────────────────
	// Checked first so an item with too little history never reaches the maths.
	if (input.is_free_text) return null;
	if (
		input.history_days != null &&
		Number(input.history_days) < s.min_history_days
	) {
		return null;
	}
	// An item that has sold nothing and lost nothing carries no signal at all.
	if (sold <= 0 && lostUnits <= 0) return null;

	// ── B.1: demand reconstruction ─────────────────────────────────────────
	const daysInStock = input.days_in_stock ?? WINDOW_DAYS;
	const estimateA = sold / Math.max(daysInStock, 1);
	const estimateB = (sold + lostUnits) / WINDOW_DAYS;
	const demandPerDay = Math.max(estimateA, estimateB);

	// ── B.3: lead time and order cycle ─────────────────────────────────────
	const leadTime = Number(input.lead_time) > 0
		? Number(input.lead_time)
		: s.default_lead_time;
	const orderCycle = Number(input.order_cycle_days) > 0
		? Number(input.order_cycle_days)
		: DEFAULT_ORDER_CYCLE_DAYS;

	// ── B.2: variability → safety stock ────────────────────────────────────
	const sigmaDaily = 0.5 * demandPerDay; // spec's <8-buckets proxy
	const safetyStock = zFor(s.service_level) * sigmaDaily * Math.sqrt(leadTime);

	// ── B.4: raw proposals ─────────────────────────────────────────────────
	let rawRop = demandPerDay * leadTime + safetyStock;
	let rawMax = rawRop + demandPerDay * orderCycle;

	// ── B.5 step 2: BOUND — guards against bad data ────────────────────────
	// The bound is skipped for a value that is currently 0, since dividing or
	// multiplying by it would pin the proposal to zero.
	if (currentRop > 0) {
		rawRop = clamp(
			rawRop,
			currentRop / s.max_change_factor,
			currentRop * s.max_change_factor,
		);
	}
	if (currentMax > 0) {
		rawMax = clamp(
			rawMax,
			currentMax / s.max_change_factor,
			currentMax * s.max_change_factor,
		);
	}

	// ── B.5 step 3: DAMP ───────────────────────────────────────────────────
	const f = Number(s.aggressiveness) / 100;
	let propRop = currentRop + f * (rawRop - currentRop);
	let propMax = currentMax + f * (rawMax - currentMax);

	// ── B.5 step 4: ROUND + COHERENCE ──────────────────────────────────────
	propRop = Math.max(0, Math.round(propRop));
	propMax = Math.max(0, Math.round(propMax));
	if (propMax < propRop + 1) propMax = propRop + 1;

	// ── B.5 step 5: MATERIALITY, each value independently ──────────────────
	const ropMaterial = isMaterial(propRop, currentRop, s);
	const maxMaterial = isMaterial(propMax, currentMax, s);
	if (!ropMaterial && !maxMaterial) return null;

	return {
		item_id: input.item_id,
		item_name: input.item_name,
		current_rop: currentRop,
		proposed_rop: ropMaterial ? propRop : null,
		current_max: currentMax,
		proposed_max: maxMaterial ? propMax : null,
		demand_per_day: round2(demandPerDay),
		lead_time: leadTime,
		safety_stock: Math.round(safetyStock),
		sold,
		lost_units: lostUnits,
		lost_sales_count: Number(input.lost_sales_count) || 0,
		days_out_of_stock:
			input.days_in_stock == null
				? null
				: Math.max(0, WINDOW_DAYS - Number(input.days_in_stock)),
		reason: buildReason({
			sold,
			lostUnits,
			lostCount: Number(input.lost_sales_count) || 0,
			demandPerDay,
			leadTime,
			daysInStock: input.days_in_stock,
		}),
		confidence: confidenceFor(input),
	};
}

function clamp(v, lo, hi) {
	return Math.min(Math.max(v, lo), hi);
}

/** §B.5 step 5 — a change must clear both an absolute and a relative floor. */
function isMaterial(proposed, current, s) {
	const threshold = Math.max(
		s.materiality_abs,
		(s.materiality_pct / 100) * current,
	);
	return Math.abs(proposed - current) >= threshold;
}

/**
 * §B.6 — every row has to justify itself, or approving and rejecting are
 * guesses. Assembled from what actually drove the number.
 */
function buildReason({ sold, lostUnits, lostCount, demandPerDay, leadTime, daysInStock }) {
	const parts = [];

	parts.push(
		sold > 0
			? `Sold ${round2(sold)} in the last 365 days (${round2(demandPerDay)}/day)`
			: 'No recorded sales in the last 365 days',
	);

	if (lostCount > 0) {
		parts.push(
			`${lostCount} lost sale${lostCount === 1 ? '' : 's'} logged (${round2(lostUnits)} units)`,
		);
	}

	if (daysInStock == null) {
		// Being explicit about this matters: without it a reader would assume
		// the out-of-stock correction had been applied.
		parts.push('no stock history yet, so demand is not corrected for stockouts');
	} else {
		const out = Math.max(0, WINDOW_DAYS - daysInStock);
		if (out > 0) parts.push(`out of stock ${out} of 365 days`);
	}

	parts.push(`lead time ${leadTime}d`);
	return `${parts.join('; ')}.`;
}

/**
 * §B.6 confidence. Stock history is what separates the tiers, and there is
 * none yet, so everything is 'low' until the nightly snapshot starts running.
 */
function confidenceFor(input) {
	if (input.days_in_stock == null) return 'low';
	const days = Number(input.days_in_stock);
	const txns = Number(input.sales_transactions) || 0;
	if (days >= 180 && txns >= 12) return 'high';
	if (days >= 90 && txns >= 6) return 'medium';
	return 'low';
}

function round2(n) {
	return Math.round(n * 100) / 100;
}

/**
 * The list's sub-line: velocity and logged lost sales.
 *
 * Confidence is no longer spelled out here — the list shows it as a meter and
 * names it on hover, so repeating the word on every row only crowded out the
 * two figures that actually differ between items.
 */
export function subLineFor(s) {
	const parts = [`Velocity ${s.demand_per_day}/day`];
	parts.push(
		s.lost_sales_count === 0
			? 'no lost sales logged'
			: `${s.lost_sales_count} lost sale${s.lost_sales_count === 1 ? '' : 's'} logged`,
	);
	return parts.join(' · ');
}
