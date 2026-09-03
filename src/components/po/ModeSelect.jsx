import { useState, useRef, useEffect } from 'react';

/**
 * Quantity-mode dropdown. A list rather than a stack of cards, so the inputs a
 * method needs sit immediately under the selection instead of far down the form.
 *
 * options: [{ id, n, name, desc, existing }]
 */
export default function ModeSelect({ options, value, onChange, placeholder }) {
	const [open, setOpen] = useState(false);
	const [active, setActive] = useState(0);
	const wrapRef = useRef(null);
	const listRef = useRef(null);

	const selected = options.find((o) => o.id === value);

	useEffect(() => {
		const onDown = (e) => {
			if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
		};
		document.addEventListener('mousedown', onDown);
		return () => document.removeEventListener('mousedown', onDown);
	}, []);

	// Open on the current selection so the arrows start from the right place.
	useEffect(() => {
		if (open) {
			const i = options.findIndex((o) => o.id === value);
			setActive(i >= 0 ? i : 0);
		}
	}, [open, options, value]);

	useEffect(() => {
		if (!open || !listRef.current) return;
		listRef.current
			.querySelector(`[data-idx="${active}"]`)
			?.scrollIntoView({ block: 'nearest' });
	}, [active, open]);

	const pick = (o) => {
		onChange(o.id);
		setOpen(false);
	};

	const onKeyDown = (e) => {
		if (!open) {
			if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				setOpen(true);
			}
			return;
		}
		if (e.key === 'Escape') {
			setOpen(false);
		} else if (e.key === 'ArrowDown') {
			e.preventDefault();
			setActive((i) => (i + 1) % options.length);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			setActive((i) => (i - 1 + options.length) % options.length);
		} else if (e.key === 'Enter') {
			e.preventDefault();
			const o = options[active];
			if (o) pick(o);
		}
	};

	return (
		<div ref={wrapRef} className="relative">
			<button
				onClick={() => setOpen((v) => !v)}
				onKeyDown={onKeyDown}
				aria-haspopup="listbox"
				aria-expanded={open}
				className={`w-full min-h-[38px] px-3 py-2 border rounded bg-surface flex items-center justify-between gap-2 cursor-pointer text-left ${
					open ? 'border-brand ring-2 ring-brand/15' : 'border-line-2'
				}`}>
				{selected ? (
					<span className="min-w-0">
						<span className="block text-[13px] font-bold text-body truncate">
							{selected.n}. {selected.name}
						</span>
						<span className="block text-[11px] text-muted truncate">
							{selected.desc}
						</span>
					</span>
				) : (
					<span className="text-[13.5px] text-muted-3">{placeholder}</span>
				)}
				<svg
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none"
					stroke="#8b919a"
					strokeWidth="2"
					strokeLinecap="round"
					strokeLinejoin="round"
					className={`flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}>
					<path d="M6 9l6 6 6-6" />
				</svg>
			</button>

			{open && (
				<div
					ref={listRef}
					role="listbox"
					className="absolute top-[calc(100%+4px)] left-0 right-0 bg-surface border border-[#e0e3e7] rounded shadow-[0_10px_30px_rgba(20,30,50,.16)] z-40 overflow-auto max-h-[320px]">
					{options.map((o, i) => {
						const isActive = i === active;
						return (
							<div
								key={o.id}
								data-idx={i}
								role="option"
								aria-selected={o.id === value}
								onMouseEnter={() => setActive(i)}
								onClick={() => pick(o)}
								className={`px-3.5 py-2.5 cursor-pointer border-b border-line-4 last:border-b-0 ${
									isActive ? 'bg-brand text-white' : 'text-body'
								}`}>
								<div className="flex items-center gap-2 flex-wrap">
									<span className="text-[13px] font-bold">
										{o.n}. {o.name}
									</span>
									{o.existing && (
										<span
											className={`text-[9.5px] font-bold uppercase tracking-wide rounded px-1.5 py-px border ${
												isActive
													? 'bg-white/20 text-white border-white/30'
													: 'bg-surface-2 text-muted border-line'
											}`}>
											existing
										</span>
									)}
								</div>
								<div
									className={`text-[11px] mt-0.5 ${isActive ? 'text-white/85' : 'text-muted'}`}>
									{o.desc}
								</div>
							</div>
						);
					})}
				</div>
			)}
		</div>
	);
}
