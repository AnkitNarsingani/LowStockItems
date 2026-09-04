import { useState, useRef, useEffect, useMemo, useId } from 'react';

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
 *
 * Keyboard-driven on the same terms as the vendor dropdown: ArrowUp/ArrowDown
 * move the highlight, Home/End jump to the ends, Enter picks, Escape closes.
 */
export default function ItemPicker({ items, loading, error, onPick }) {
	const [search, setSearch] = useState('');
	const [open, setOpen] = useState(false);
	const [pos, setPos] = useState(null);
	const [active, setActive] = useState(0);
	const wrapRef = useRef(null);
	const inputRef = useRef(null);
	const listRef = useRef(null);
	// Each row has its own picker, so the listbox id must be unique per one.
	const listId = useId();

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

	// A new search means the old highlight index points at nothing meaningful.
	useEffect(() => setActive(0), [search]);

	// Keep the highlighted row in view as the arrows walk past the fold.
	useEffect(() => {
		if (!open || !listRef.current) return;
		listRef.current
			.querySelector(`[data-idx="${active}"]`)
			?.scrollIntoView({ block: 'nearest' });
	}, [active, open, results.length]);

	const choose = (it) => {
		onPick(it);
		setSearch('');
		setOpen(false);
	};

	const onKeyDown = (e) => {
		if (e.key === 'Escape') {
			setOpen(false);
			return;
		}
		// Arrowing at a closed list opens it rather than doing nothing.
		if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
			e.preventDefault();
			setOpen(true);
			return;
		}
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			setActive((i) => (results.length ? (i + 1) % results.length : 0));
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			setActive((i) =>
				results.length ? (i - 1 + results.length) % results.length : 0,
			);
		} else if (e.key === 'Home') {
			e.preventDefault();
			setActive(0);
		} else if (e.key === 'End') {
			e.preventDefault();
			setActive(Math.max(0, results.length - 1));
		} else if (e.key === 'Enter') {
			e.preventDefault();
			const it = results[active];
			if (it) choose(it);
		}
	};

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
				onKeyDown={onKeyDown}
				role="combobox"
				aria-expanded={open}
				aria-controls={listId}
				aria-autocomplete="list"
				placeholder={
					loading && items.length === 0
						? 'Loading items…'
						: 'Type or click to select an item.'
				}
				className="w-full h-[34px] border border-line-2 rounded-lg px-2.5 text-[13.5px] outline-none text-body bg-surface transition-shadow hover:border-muted-4 focus:border-brand"
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
					className="z-50 animate-slide-down bg-surface border border-line-2 rounded-xl shadow-pop overflow-hidden">
					<div
						id={listId}
						ref={listRef}
						className="max-h-[250px] overflow-auto"
						role="listbox">
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
							results.map((it, i) => {
								const stock = Number(
									it.available_stock ?? it.stock_on_hand ?? 0,
								);
								const isActive = i === active;
								return (
									<div
										key={it.item_id}
										data-idx={i}
										role="option"
										aria-selected={isActive}
										onMouseEnter={() => setActive(i)}
										onClick={() => choose(it)}
										className={`flex justify-between px-[13px] py-[9px] cursor-pointer border-b border-line-4 transition-colors duration-100 ${
											isActive
												? 'bg-gradient-to-r from-brand-500 to-brand-600'
												: 'hover:bg-brand-50'
										}`}>
										<div className="min-w-0">
											<div
												className={`text-[13.5px] font-black truncate ${
													isActive ? 'text-white' : 'text-heading'
												}`}>
												{it.name}
											</div>
											<div
												className={`text-[11px] mt-0.5 truncate ${
													isActive ? 'text-white/80' : 'text-muted-2'
												}`}>
												SKU: {it.sku || '—'} · Purchase Rate:{' '}
												{money(it.purchase_rate ?? it.rate)}
											</div>
										</div>
										<div className="text-right whitespace-nowrap pl-3.5">
											<div
												className={`text-[11px] ${
													isActive ? 'text-white/80' : 'text-muted-2'
												}`}>
												Stock on Hand
											</div>
											<div
												className={`num text-[12.5px] font-bold mt-0.5 ${
													isActive
														? 'text-white'
														: stock > 0
															? 'text-ok'
															: 'text-danger'
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
