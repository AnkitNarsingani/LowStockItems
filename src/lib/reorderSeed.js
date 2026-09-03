// ─────────────────────────────────────────────────────────────────────────────
// SAMPLE DATA — not real suggestions.
//
// Engine B (reorder suggestions) is explicitly out of scope in
// docs/LowStockItems-Build-Spec-Phase1-2.md and will be specified separately.
// This fixture exists so the review screen can be designed and tried out before
// the engine exists. It computes nothing and reads nothing from Zoho.
//
// The shape matches the engine's documented output contract
// (LowStockItems-Algorithm-Spec.md §B.6), so wiring the real engine in later is
// a matter of replacing this array — the screen should not need to change.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} ReorderSuggestion
 * @property {string} item_id
 * @property {string} item_name
 * @property {number} current_rop
 * @property {number|null} proposed_rop   null when materiality suppressed it
 * @property {number} current_max
 * @property {number|null} proposed_max
 * @property {number} demand_per_day
 * @property {number} lead_time           days
 * @property {number} safety_stock
 * @property {number} lost_sales_count
 * @property {number} lost_sales_units
 * @property {number} days_out_of_stock   within the trailing 365
 * @property {string} reason              human-readable justification
 * @property {'low'|'medium'|'high'} confidence
 */

/** @type {ReorderSuggestion[]} */
export const SEED_SUGGESTIONS = [
	{
		item_id: 'sample-1',
		item_name: 'Crew Tee, M',
		current_rop: 5,
		proposed_rop: 8,
		current_max: 40,
		proposed_max: 60,
		demand_per_day: 0.9,
		lead_time: 21,
		safety_stock: 4,
		lost_sales_count: 3,
		lost_sales_units: 14,
		days_out_of_stock: 40,
		reason:
			'Out of stock 40 of 365 days; 3 lost sales logged (14 units); lead time 21d.',
		confidence: 'high',
	},
	{
		item_id: 'sample-2',
		item_name: 'Fleece Hoodie, M',
		current_rop: 8,
		proposed_rop: 12,
		current_max: 50,
		proposed_max: 70,
		demand_per_day: 1.4,
		lead_time: 18,
		safety_stock: 6,
		lost_sales_count: 5,
		lost_sales_units: 22,
		days_out_of_stock: 31,
		reason:
			'Out of stock 31 of 365 days; 5 lost sales logged (22 units); lead time 18d.',
		confidence: 'high',
	},
	{
		// A value going DOWN — the engine can lower a max capacity.
		item_id: 'sample-3',
		item_name: 'Canvas Tote',
		current_rop: 10,
		proposed_rop: 6,
		current_max: 80,
		proposed_max: 50,
		demand_per_day: 0.3,
		lead_time: 24,
		safety_stock: 2,
		lost_sales_count: 0,
		lost_sales_units: 0,
		days_out_of_stock: 0,
		reason:
			'Never out of stock; demand fell to 0.3/day, so stock is sitting idle. Lead time 24d.',
		confidence: 'medium',
	},
	{
		// UNCHANGED — shown in grey, carries no write.
		item_id: 'sample-4',
		item_name: 'Ribbed Socks, L',
		current_rop: 12,
		proposed_rop: 12,
		current_max: 60,
		proposed_max: 60,
		demand_per_day: 0.6,
		lead_time: 21,
		safety_stock: 3,
		lost_sales_count: 0,
		lost_sales_units: 0,
		days_out_of_stock: 2,
		reason: 'Current values already match demand; change below the materiality threshold.',
		confidence: 'medium',
	},
	{
		// Only one of the two values moves — the other was suppressed.
		item_id: 'sample-5',
		item_name: 'Denim Jacket',
		current_rop: 4,
		proposed_rop: 9,
		current_max: 30,
		proposed_max: 30,
		demand_per_day: 1.1,
		lead_time: 28,
		safety_stock: 7,
		lost_sales_count: 2,
		lost_sales_units: 5,
		days_out_of_stock: 18,
		reason:
			'Out of stock 18 of 365 days; 2 lost sales logged (5 units); long 28d lead time raises the reorder point.',
		confidence: 'medium',
	},
	{
		item_id: 'sample-6',
		item_name: 'Linen Shirt, S',
		current_rop: 6,
		proposed_rop: 4,
		current_max: 45,
		proposed_max: 36,
		demand_per_day: 0.25,
		lead_time: 15,
		safety_stock: 2,
		lost_sales_count: 0,
		lost_sales_units: 0,
		days_out_of_stock: 0,
		reason:
			'Thin sales history — estimated from sibling sizes. Treat with care.',
		confidence: 'low',
	},
];

// The design's sub-line: velocity, logged lost sales, confidence.
export function subLineFor(s) {
	const parts = [`Velocity ${s.demand_per_day}/day`];
	parts.push(
		s.lost_sales_count === 0
			? 'no lost sales logged'
			: `${s.lost_sales_count} lost sale${s.lost_sales_count === 1 ? '' : 's'} logged`,
	);
	parts.push(`${s.confidence} confidence`);
	return parts.join(' · ');
}
