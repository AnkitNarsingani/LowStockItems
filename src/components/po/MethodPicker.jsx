import { useState, useCallback, useMemo } from 'react';
import {
	METHODS,
	DEFAULT_DAMPING_EXPONENT,
	DEFAULT_COVER_DAYS,
	SALES_WINDOW_DAYS,
	deriveRow,
	allocate,
	emitStockoutSignals,
} from '../../lib/allocation';
import { recordStockoutSignals } from '../../lib/stockoutSignals';
import { calculateBundleQuantities, simpleQuantityFor } from '../ZohoAPI';
import { getSales, peekSales, missingFor } from '../../lib/salesCache';
import Toggle from './Toggle';
import ModeSelect from './ModeSelect';
import Field from '../Field';

// Re-exported so existing imports keep working.
export { Field };

// Method 2 keeps its 180-day window; methods 3–6 use 365. Method 1 needs none.
const WINDOW_FOR = {
	[METHODS.SIMPLE]: null,
	[METHODS.BUNDLE_VELOCITY]: 180,
	[METHODS.BUNDLE_DAMPED]: SALES_WINDOW_DAYS,
	[METHODS.COVER_DAYS]: SALES_WINDOW_DAYS,
	[METHODS.COVER_BUNDLE]: SALES_WINDOW_DAYS,
	[METHODS.SIMPLE_BALANCE]: null,
};

const METHOD_LIST = [
	{
		id: METHODS.SIMPLE,
		n: 1,
		name: 'Simple',
		desc: 'Quantity = maximum capacity − available stock',
		existing: true,
		needs: [],
	},
	{
		id: METHODS.BUNDLE_VELOCITY,
		n: 2,
		name: 'Bundle',
		desc: 'Fixed total, distributed by sales velocity',
		existing: true,
		needs: ['B'],
	},
	{
		id: METHODS.BUNDLE_DAMPED,
		n: 3,
		name: 'Bundle — damped size-curve',
		desc: 'Share of a fixed total by soldᵉ, so slow sizes keep a share',
		existing: false,
		needs: ['B', 'e'],
	},
	{
		id: METHODS.COVER_DAYS,
		n: 4,
		name: 'Cover-duration',
		desc: 'Cover D days of demand for every item. No fixed total',
		existing: false,
		needs: ['D'],
	},
	{
		id: METHODS.COVER_BUNDLE,
		n: 5,
		name: 'Cover-duration fitted to bundle',
		desc: 'The cover-duration shape, scaled to hit a fixed total exactly',
		existing: false,
		needs: ['B', 'D'],
	},
	{
		id: METHODS.SIMPLE_BALANCE,
		n: 6,
		name: 'Simple + equal balance',
		desc: 'Starts at Simple, then closes the gap to the bundle total equally',
		existing: false,
		needs: ['B'],
	},
];

const nf = (v) => (v == null ? '—' : Number(v).toLocaleString('en-IN'));

export default function MethodPicker({ lines, onApply }) {
	// Nothing is persisted — the picker opens fresh with no method preselected.
	const [method, setMethod] = useState(null);
	const [bundleTotal, setBundleTotal] = useState('');
	const [exponent, setExponent] = useState(String(DEFAULT_DAMPING_EXPONENT));
	const [coverDays, setCoverDays] = useState(String(DEFAULT_COVER_DAYS));
	const [overrideMax, setOverrideMax] = useState(false);

	const [preview, setPreview] = useState(null);
	const [busy, setBusy] = useState(false);
	const [progress, setProgress] = useState(null);
	const [error, setError] = useState(null);
	const [notice, setNotice] = useState(null);

	const allocatable = useMemo(
		() => lines.filter((l) => !l.isFreeText && l.item_id),
		[lines],
	);
	// Counted directly, not as a remainder — the table's trailing blank row is
	// neither allocatable nor free text.
	const freeTextCount = useMemo(
		() => lines.filter((l) => l.isFreeText).length,
		[lines],
	);

	const spec = METHOD_LIST.find((m) => m.id === method);
	const pendingEnrich = allocatable.filter((l) => l.enriched === false).length;

	const invalidate = useCallback(() => {
		setPreview(null);
		setError(null);
		setNotice(null);
	}, []);

	const choose = (id) => {
		setMethod(id);
		invalidate();
	};

	const isValid = (() => {
		if (!spec) return false;
		if (spec.needs.includes('B') && !(Number(bundleTotal) > 0)) return false;
		if (spec.needs.includes('D') && !(Number(coverDays) > 0)) return false;
		if (spec.needs.includes('e')) {
			const e = Number(exponent);
			if (!(e >= 0 && e <= 1)) return false;
		}
		return true;
	})();

	const runPreview = async () => {
		if (!isValid || allocatable.length === 0) return;
		setBusy(true);
		setError(null);
		setNotice(null);
		setPreview(null);

		try {
			const win = WINDOW_FOR[method];

			if (win) {
				// Only what is genuinely absent is fetched. Anything already read —
				// by an earlier preview, an earlier visit to this page, or the
				// reorder run — is reused.
				const missing = missingFor(
					allocatable.map((l) => l.item_id),
					win,
				);
				const reused = allocatable.length - missing.length;
				setProgress({ done: 0, total: missing.length, reused });

				for (let i = 0; i < missing.length; i++) {
					await getSales(missing[i], win);
					setProgress({ done: i + 1, total: missing.length, reused });
					// Same pacing the rest of the app uses against the proxy.
					if (i < missing.length - 1) {
						await new Promise((r) => setTimeout(r, 150));
					}
				}

				setProgress(null);
			}

			const soldFor = (l) => (win ? (peekSales(l.item_id, win) ?? 0) : 0);
			let qtyByIndex;

			if (method === METHODS.SIMPLE) {
				// Method 1 — MUST PRESERVE. Same helper the create call uses.
				qtyByIndex = allocatable.map((l) => simpleQuantityFor(l) ?? 0);
			} else if (method === METHODS.BUNDLE_VELOCITY) {
				// Method 2 — MUST PRESERVE. The real function, fed from the cache so
				// the preview costs no extra API calls.
				const qtyMap = await calculateBundleQuantities(
					allocatable,
					Number(bundleTotal),
					{
						getSales: async (itemId) => peekSales(itemId, 180) ?? 0,
						interDelay: 0,
					},
				);

				if (qtyMap) {
					qtyByIndex = allocatable.map((l) => qtyMap[l.item_id] ?? 0);
				} else {
					// MUST PRESERVE: with no candidates the existing code path falls
					// through to Simple, so the preview has to do the same.
					qtyByIndex = allocatable.map((l) => simpleQuantityFor(l) ?? 0);
					setNotice(
						'No item qualified for bundle allocation — every item is at or over max capacity, or has none set. Falling back to Simple, exactly as the existing behaviour does. Method 3 or 6 will spread across the group instead.',
					);
				}
			} else {
				const rows = allocatable.map((l) =>
					deriveRow(l, soldFor(l), overrideMax),
				);
				qtyByIndex = allocate(rows, {
					method,
					bundleTotal: Number(bundleTotal),
					exponent: Number(exponent),
					coverDays: Number(coverDays),
				});
			}

			const rows = allocatable.map((l, i) => ({
				key: l.key,
				name: l.name,
				onHand: Number(l.available_stock ?? l.stock_on_hand ?? 0) || 0,
				max: Number(l.cf_maximum_capacity) || 0,
				sold: win ? soldFor(l) : null,
				qty: qtyByIndex[i] ?? 0,
			}));

			setPreview({
				rows,
				window: win,
				total: rows.reduce((s, r) => s + r.qty, 0),
			});

			// §A.5: evaluating a selection is the moment the stockout-group
			// condition can be observed — it depends on the whole group's stock
			// levels right now, which Zoho does not retain. Recorded on every
			// method, deduplicated per item per day by the endpoint, and
			// deliberately not awaited: this is a side effect of previewing and
			// must never delay or break it.
			const signalRows = allocatable.map((l) => deriveRow(l, 0, false));
			recordStockoutSignals(emitStockoutSignals(signalRows));
		} catch (e) {
			setError(e.message || 'Preview failed.');
		} finally {
			setBusy(false);
			setProgress(null);
		}
	};

	const apply = () => {
		if (!preview) return;
		const map = {};
		for (const r of preview.rows) map[r.key] = r.qty;
		onApply(map);
	};

	const supportsOverride =
		spec && spec.id !== METHODS.SIMPLE && spec.id !== METHODS.BUNDLE_VELOCITY;

	return (
		<>
			<Field label="Quantity mode" align="start">
				<ModeSelect
					options={METHOD_LIST}
					value={method}
					onChange={choose}
					placeholder="Select a quantity mode"
				/>

				{/* A method's own inputs live right under the dropdown, so the knobs
				    are next to the choice that introduced them. */}
				{spec && (
					<div className="mt-3 flex flex-col gap-3">
						{spec.needs.includes('B') && (
							<Knob
								label={
									<>
										Total bundle quantity <span className="text-danger">*</span>
									</>
								}
								hint="Distributed across the items on this page."
								value={bundleTotal}
								onChange={(v) => {
									setBundleTotal(v);
									invalidate();
								}}
								min="1"
								placeholder="e.g. 500"
							/>
						)}

						{spec.needs.includes('D') && (
							<Knob
								label={
									<>
										Target cover (days) <span className="text-danger">*</span>
									</>
								}
								hint="Days of demand each item should hold, from its trailing 365-day sales."
								value={coverDays}
								onChange={(v) => {
									setCoverDays(v);
									invalidate();
								}}
								min="1"
							/>
						)}

						{spec.needs.includes('e') && (
							<Knob
								label="Damping exponent e"
								hint="1 = raw sales share · 0 = equal split · 0.5 = compressed."
								value={exponent}
								onChange={(v) => {
									setExponent(v);
									invalidate();
								}}
								min="0"
								max="1"
								step="0.05"
							/>
						)}

						{supportsOverride && (
							<div>
								<div className="flex items-center gap-2.5">
									<Toggle
										on={overrideMax}
										onChange={() => {
											setOverrideMax((v) => !v);
											invalidate();
										}}
									/>
									<span className="text-[12.5px] font-semibold text-body">
										Allow ordering past max capacity
									</span>
								</div>
								<div className="text-[11px] text-muted mt-1">
									Lifts the headroom clamp for this PO only. Methods 1 and 2 are
									unaffected.
								</div>
							</div>
						)}
					</div>
				)}

				<p className="text-[11px] text-muted mt-2.5">
					Shares are computed across the {allocatable.length} item
					{allocatable.length !== 1 ? 's' : ''} on this page — that selection is
					the group.
					{freeTextCount > 0 && (
						<>
							{' '}
							{freeTextCount} free-text line
							{freeTextCount !== 1 ? 's are' : ' is'} excluded.
						</>
					)}
				</p>
			</Field>

			{/* Preview — a full-width band, so the result table gets the whole page
			    rather than the narrow control column. */}
			<div className="-mx-8 mt-1 px-8 py-[18px] border-y border-line bg-sidebar">
				<div className="flex items-start justify-between gap-4 flex-wrap">
					<div className="min-w-0">
						<div className="text-[13px] font-bold text-body">
							Quantity preview
						</div>
						<div className="text-[11.5px] text-muted mt-0.5">
							{!method
								? 'Pick a quantity mode above to work out order quantities.'
								: !isValid
									? 'Fill in the inputs above, then preview.'
									: 'Read-only — nothing reaches the table until you apply it.'}
						</div>
					</div>

					<div className="flex items-center gap-2.5 flex-wrap flex-shrink-0">
						<button
							onClick={runPreview}
							disabled={!isValid || busy || allocatable.length === 0}
							className="h-[38px] px-4 rounded border border-line-2 bg-surface text-body-2 font-bold text-[13px] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2">
							{busy && (
								<span className="w-3.5 h-3.5 border-2 border-muted-4 border-t-body-3 rounded-full animate-spin" />
							)}
							{busy ? 'Computing…' : 'Preview quantities'}
						</button>

						{preview && (
							<button
								onClick={apply}
								className="h-[38px] px-4 rounded border border-brand bg-brand text-white font-bold text-[13px] cursor-pointer shadow-[0_1px_2px_rgba(64,141,251,.35)]">
								Use these quantities
							</button>
						)}
					</div>
				</div>

				{progress && (
					<div className="text-[11px] text-muted mt-2 num">
						{progress.total > 0
							? `Fetching sales… ${progress.done} / ${progress.total}`
							: 'Using cached sales'}
						{progress.reused > 0 ? ` · ${progress.reused} reused` : ''}
					</div>
				)}
				{pendingEnrich > 0 && (
					<div className="text-[11px] text-warn-2 mt-2">
						Loading full details for {pendingEnrich} newly added item
						{pendingEnrich !== 1 ? 's' : ''} — preview once that finishes.
					</div>
				)}
				{error && (
					<div className="text-[12px] text-danger bg-red-50 border border-danger-border rounded px-3 py-2 mt-2.5">
						{error}
					</div>
				)}
				{notice && (
					<div className="text-[12px] text-warn-2 bg-warn-bg border border-warn-border rounded px-3 py-2 mt-2.5">
						{notice}
					</div>
				)}

				{preview && (
					<div className="mt-3 border border-line rounded overflow-hidden bg-surface">
						<div className="flex items-center justify-between px-3.5 py-2 bg-surface-2 border-b border-line">
							<span className="text-[11.5px] text-muted">
								Read-only — nothing is saved until you create the PO.
							</span>
							<span className="num text-[12.5px] font-bold text-body">
								Total: {nf(preview.total)}
							</span>
						</div>
						<div className="max-h-[280px] overflow-auto">
							<div className="grid grid-cols-[2fr_0.8fr_0.8fr_0.9fr_0.9fr] bg-surface-2 border-b border-line text-[10px] font-bold text-muted tracking-[.04em]">
								<div className="px-3 py-1.5">ITEM</div>
								<div className="px-3 py-1.5 text-right">ON HAND</div>
								<div className="px-3 py-1.5 text-right">MAX</div>
								<div className="px-3 py-1.5 text-right">
									SOLD{preview.window ? ` ${preview.window}D` : ''}
								</div>
								<div className="px-3 py-1.5 text-right">ORDER QTY</div>
							</div>
							{preview.rows.map((r) => (
								<div
									key={r.key}
									className={`grid grid-cols-[2fr_0.8fr_0.8fr_0.9fr_0.9fr] border-b border-line-4 text-[12.5px] ${
										r.qty === 0 ? 'text-muted-2' : 'text-body-3'
									}`}>
									<div className="px-3 py-1.5 truncate">{r.name}</div>
									<div className="num px-3 py-1.5 text-right">
										{nf(r.onHand)}
									</div>
									<div className="num px-3 py-1.5 text-right">{nf(r.max)}</div>
									<div className="num px-3 py-1.5 text-right">
										{r.sold == null ? '—' : nf(r.sold)}
									</div>
									<div
										className={`num px-3 py-1.5 text-right font-bold ${
											r.qty === 0 ? '' : 'text-body'
										}`}>
										{nf(r.qty)}
									</div>
								</div>
							))}
						</div>
						<div className="px-3.5 py-2 text-[11px] text-muted-2">
							Lines showing 0 stay visible so you can see why, but are dropped
							from the PO.
						</div>
					</div>
				)}
			</div>
		</>
	);
}

function Knob({ label, hint, value, onChange, ...rest }) {
	return (
		<label className="block">
			<span className="block text-[12.5px] font-semibold text-body mb-1">
				{label}
			</span>
			<input
				type="number"
				value={value}
				onChange={(e) => onChange(e.target.value)}
				className="num w-full h-[38px] border border-line-2 rounded px-3 text-[13.5px] outline-none focus:border-brand"
				{...rest}
			/>
			{hint && (
				<span className="block text-[11px] text-muted mt-1">{hint}</span>
			)}
		</label>
	);
}
