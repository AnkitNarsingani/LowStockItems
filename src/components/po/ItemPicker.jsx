import { useState, useRef, useEffect, useMemo } from 'react';

const money = (v) =>
	'₹' +
	Number(v || 0).toLocaleString('en-IN', {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	});

/**
 * The item cell's search-and-pick dropdown, per the design canvas: each result
 * shows name, a grey SKU / purchase-rate line, and a right-aligned Stock on
 * Hand that is green when positive and red at or below zero.
 *
 * Real Zoho items only — there is no free-text path here, so a line can never
 * reference something the catalogue does not know about.
 */
export default function ItemPicker({ items, loading, error, onPick }) {
	const [search, setSearch] = useState('');
	const [open, setOpen] = useState(false);
	const [pos, setPos] = useState(null);
	const wrapRef = useRef(null);
	const inputRef = useRef(null);

	const results = useMemo(() => {
		const q = search.toLowerCase().trim();
		const list = q
			? items.filter(
					(i) =>
						(i.name || '').toLowerCase().includes(q) ||
						(i.sku || '').toLowerCase().includes(q),
				)
			: items;
		return list.slice(0, 100);
	}, [items, search]);

	useEffect(() => {
		const onDown = (e) => {
			if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
		};
		document.addEventListener('mousedown', onDown);
		return () => document.removeEventListener('mousedown', onDown);
	}, []);

	// Fixed positioning so the panel escapes the table's overflow container.
	useEffect(() => {
		if (!open) return undefined;
		const place = () => {
			const el = inputRef.current;
			if (!el) return;
			const r = el.getBoundingClientRect();
			const width = 360;
			const below = window.innerHeight - r.bottom;
			const up = below < 300 && r.top > below;
			setPos({
				left: Math.min(Math.max(8, r.left), window.innerWidth - width - 8),
				top: up ? undefined : r.bottom + 4,
				bottom: up ? window.innerHeight - r.top + 4 : undefined,
				width,
			});
		};
		place();
		window.addEventListener('scroll', place, true);
		window.addEventListener('resize', place);
		return () => {
			window.removeEventListener('scroll', place, true);
			window.removeEventListener('resize', place);
		};
	}, [open]);


	return (
		<div ref={wrapRef} className="relative">
			<input
				ref={inputRef}
				value={search}
				onChange={(e) => {
					setSearch(e.target.value);
					setOpen(true);
				}}
				onFocus={() => setOpen(true)}
				onKeyDown={(e) => {
					if (e.key === 'Escape') setOpen(false);
				}}
				placeholder={
					loading && items.length === 0
						? 'Loading items…'
						: 'Type or click to select an item.'
				}
				className="w-full h-[34px] border border-line-2 rounded px-2.5 text-[13.5px] outline-none text-body focus:border-brand"
			/>

			{open && pos && (
				<div
					style={{
						position: 'fixed',
						left: pos.left,
						top: pos.top,
						bottom: pos.bottom,
						width: pos.width,
					}}
					className="z-50 bg-surface border border-[#e0e3e7] rounded shadow-[0_14px_38px_rgba(20,30,50,.20)] overflow-hidden">
					<div className="max-h-[250px] overflow-auto">
						{error ? (
							<div className="px-[13px] py-4 text-center text-danger text-[12.5px]">
								{error}
							</div>
						) : loading && items.length === 0 ? (
							<div className="px-[13px] py-4 text-center text-muted-2 text-[12.5px]">
								Loading items…
							</div>
						) : results.length === 0 ? (
							<div className="px-[13px] py-4 text-center text-muted-2 text-[12.5px]">
								No matching items
							</div>
						) : (
							results.map((it) => {
								const stock = Number(
									it.available_stock ?? it.stock_on_hand ?? 0,
								);
								return (
									<div
										key={it.item_id}
										onClick={() => {
											onPick(it);
											setSearch('');
											setOpen(false);
										}}
										className="flex justify-between px-[13px] py-[9px] cursor-pointer border-b border-[#f4f5f6] hover:bg-surface-2">
										<div className="min-w-0">
											<div className="text-[13.5px] font-bold text-body truncate">
												{it.name}
											</div>
											<div className="text-[11px] text-muted-2 mt-0.5 truncate">
												SKU: {it.sku || '—'} · Purchase Rate:{' '}
												{money(it.purchase_rate ?? it.rate)}
											</div>
										</div>
										<div className="text-right whitespace-nowrap pl-3.5">
											<div className="text-[11px] text-muted-2">
												Stock on Hand
											</div>
											<div
												className={`num text-[12.5px] font-bold mt-0.5 ${
													stock > 0 ? 'text-ok' : 'text-danger'
												}`}>
												{stock}
											</div>
										</div>
									</div>
								);
							})
						)}
					</div>

				</div>
			)}
		</div>
	);
}
