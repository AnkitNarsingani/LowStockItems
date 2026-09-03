import { useMemo } from 'react';
import ItemPicker from './ItemPicker';

const money = (v) =>
	'₹' +
	Number(v || 0).toLocaleString('en-IN', {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	});

/**
 * PO line table, laid out as a CSS grid to match the design canvas:
 * ITEM DETAILS · MAX CAPACITY · QUANTITY · RATE · AMOUNT · (remove)
 */
export default function POItemTable({
	lines,
	allItems,
	itemsLoading,
	itemsError,
	showRate,
	onChangeLine,
	onRemoveLine,
	onPickItem,
	onOpenBulk,
}) {
	// The design drops RATE and AMOUNT while rates are being sourced from the
	// last bill — there is nothing meaningful to show until they are fetched.
	//
	// minmax(0,…) matters: a bare `1fr` is `minmax(auto, 1fr)`, so the track can
	// never shrink below its content's minimum width. Header and rows are
	// separate grids, so an <input>'s default intrinsic width or a long SKU line
	// would size each row's columns differently and the table would step out of
	// alignment. Flooring every track at 0 makes the split purely proportional.
	const cols = showRate
		? 'minmax(0,2.1fr) minmax(0,0.8fr) minmax(0,0.9fr) minmax(0,0.85fr) minmax(0,0.85fr) minmax(0,1fr)'
		: 'minmax(0,2.1fr) minmax(0,0.8fr) minmax(0,0.9fr) minmax(0,0.85fr)';

	const grandTotal = useMemo(
		() =>
			lines.reduce(
				(s, l) => s + (Number(l.quantity) || 0) * (Number(l.poRate) || 0),
				0,
			),
		[lines],
	);

	// The trailing blank row is scaffolding, not a line — leave it out of counts.
	const filledCount = useMemo(
		() => lines.filter((l) => l.item_id || l.isFreeText).length,
		[lines],
	);

	return (
		<div className="bg-surface border border-line rounded overflow-visible mr-11">
			<div className="flex items-center justify-between px-[18px] py-[13px] bg-surface-2 border-b border-line rounded-t-[10px]">
				<div className="font-bold text-[14px] text-body">Item Table</div>
				<div className="num text-[12.5px] text-body-3">
					{filledCount} line{filledCount !== 1 ? 's' : ''}
					{showRate ? ` · ${money(grandTotal)}` : ''}
				</div>
			</div>

			{/* Header */}
			<div
				className="grid bg-surface-2 border-b border-line text-[10.5px] font-bold text-muted tracking-[.04em]"
				style={{ gridTemplateColumns: cols }}>
				<div className="px-3.5 py-2.5 border-r border-line min-w-0">ITEM DETAILS</div>
				<div className="px-3.5 py-2.5 border-r border-line text-right min-w-0">
					STOCK ON HAND
				</div>
				<div className="px-3.5 py-2.5 border-r border-line text-right min-w-0">
					MAX CAPACITY
				</div>
				<div
					className={`px-3.5 py-2.5 text-right min-w-0 ${showRate ? 'border-r border-line' : ''}`}>
					QUANTITY
				</div>
				{showRate && (
					<>
						<div className="px-3.5 py-2.5 border-r border-line text-right min-w-0">
							RATE
						</div>
						<div className="px-3.5 py-2.5 text-right min-w-0">AMOUNT</div>
					</>
				)}
			</div>

			{lines.map((line) => (
				<POLineRow
					key={line.key}
					line={line}
					cols={cols}
					showRate={showRate}
					allItems={allItems}
					itemsLoading={itemsLoading}
					itemsError={itemsError}
					onChangeLine={onChangeLine}
					onRemoveLine={onRemoveLine}
					onPickItem={onPickItem}
				/>
			))}

			<div className="flex gap-3 px-[18px] py-4 flex-wrap">
				<button
					onClick={onOpenBulk}
					className="flex items-center gap-[7px] h-9 px-3.5 rounded border border-brand-border bg-brand-bg text-link font-bold text-[13px] cursor-pointer">
					<PlusCircle />
					Add Items in Bulk
				</button>
			</div>
		</div>
	);
}

function POLineRow({
	line,
	cols,
	showRate,
	allItems,
	itemsLoading,
	itemsError,
	onChangeLine,
	onRemoveLine,
	onPickItem,
}) {
	const qty = Number(line.quantity) || 0;
	const rate = Number(line.poRate) || 0;
	const amount = qty * rate;

	const maxCap = Number(line.cf_maximum_capacity);
	const onHand = Number(line.available_stock ?? line.stock_on_hand ?? 0) || 0;

	const set = (patch) => onChangeLine(line.key, patch);

	const overMax =
		!line.isFreeText && !isNaN(maxCap) && maxCap > 0 && onHand + qty > maxCap;

	// items-stretch, not items-start: a cell sized to its own content leaves the
	// vertical border-r short of the row height whenever a sibling cell is taller
	// (a filled item cell carries three lines). Padding keeps content top-aligned.
	return (
		<div
			className="grid border-b border-line items-stretch relative"
			style={{ gridTemplateColumns: cols }}>
			{/* ITEM DETAILS */}
			<div className="px-3.5 py-3 border-r border-line relative min-w-0">
				{line.item_id || line.isFreeText ? (
					<div className="pl-2.5">
						<div className="flex items-center gap-[7px] flex-wrap">
							<span className="font-bold text-[13.5px] text-body">
								{line.name}
							</span>
							{line.isFreeText && (
								<span className="text-[10px] font-bold text-warn-2 bg-warn-bg border border-warn-border rounded-[20px] px-2 py-px">
									new
								</span>
							)}
						</div>

						{line.isFreeText ? (
							<div className="text-[11px] text-warn-2 mt-1 leading-[1.35] max-w-[230px]">
								Free-text item — kept on the PO but excluded from every quantity
								allocation method.
							</div>
						) : (
							<div className="text-[11.5px] text-muted-2 mt-0.5">
								SKU: {line.sku || '—'} Purchase Rate:{' '}
								{money(line.purchase_rate)}
							</div>
						)}
					</div>
				) : (
					<ItemPicker
						items={allItems}
						loading={itemsLoading}
						error={itemsError}
						onPick={(item) => onPickItem(line.key, item)}
					/>
				)}
			</div>

			{/* STOCK ON HAND — the same figure the allocation maths reads, so the
			    column and the quantity it produces can never disagree. */}
			<div className="num px-3.5 py-3 border-r border-line text-right text-[13.5px] min-w-0">
				{line.isFreeText ? (
					<span className="text-muted-2">—</span>
				) : (
					<span className={onHand > 0 ? 'text-ok font-bold' : 'text-danger font-bold'}>
						{onHand}
					</span>
				)}
			</div>

			{/* MAX CAPACITY */}
			<div
				className={`num px-3.5 py-3 border-r border-line text-right text-[13.5px] min-w-0 ${
					overMax ? 'text-warn font-bold' : 'text-body-3'
				}`}
				title={overMax ? 'Ordering past maximum capacity' : undefined}>
				{line.isFreeText || isNaN(maxCap) ? '—' : maxCap}
			</div>

			{/* QUANTITY */}
			<div
				className={`px-3.5 py-2.5 min-w-0 ${showRate ? 'border-r border-line' : ''}`}>
				<input
					type="number"
					min="0"
					value={line.quantity}
					onChange={(e) => set({ quantity: e.target.value })}
					className="num w-full min-w-0 h-[34px] border border-line rounded px-2.5 text-right text-[13.5px] outline-none focus:border-brand"
				/>
			</div>

			{showRate && (
				<>
					{/* RATE */}
					<div className="px-3.5 py-2.5 border-r border-line min-w-0">
						<input
							type="number"
							min="0"
							step="0.01"
							value={line.poRate}
							onChange={(e) => set({ poRate: e.target.value })}
							placeholder="0.00"
							className="num w-full min-w-0 h-[34px] border border-line rounded px-2.5 text-right text-[13.5px] outline-none focus:border-brand"
						/>
					</div>

					{/* AMOUNT */}
					<div className="num px-3.5 py-3 text-right text-[13.5px] font-bold text-body min-w-0">
						{money(amount)}
					</div>
				</>
			)}

			{/* Remove — positioned outside the table, so the grid ends at the last
			    data column. Absolute against the row keeps it centred on that row
			    whatever its height. The trailing blank row has nothing to remove,
			    and deleting it would only make the table grow a fresh one. */}
			{(line.item_id || line.isFreeText) && (
				<button
					onClick={() => onRemoveLine(line.key)}
					title="Remove line"
					aria-label={`Remove ${line.name || 'this line'}`}
					className="absolute right-[-38px] top-1/2 -translate-y-1/2 w-7 h-7 rounded border border-danger-border bg-surface flex items-center justify-center cursor-pointer text-danger hover:bg-red-50">
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
						<path d="M3 6h18" />
						<path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
						<path d="M19 6l-1 14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1L5 6" />
						<path d="M10 11v6M14 11v6" />
					</svg>
				</button>
			)}
		</div>
	);
}

function PlusCircle() {
	return (
		<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2f7be0" strokeWidth="2">
			<circle cx="12" cy="12" r="9" />
			<path d="M12 8v8M8 12h8" strokeLinecap="round" />
		</svg>
	);
}
