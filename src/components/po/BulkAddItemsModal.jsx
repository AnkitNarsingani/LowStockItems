import { useState, useEffect, useMemo } from 'react';
import { RoundCheck } from '../Checkbox';

const money = (v) =>
	'₹' +
	Number(v || 0).toLocaleString('en-IN', {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	});

/**
 * "Add Items in Bulk" — left pane is a searchable, tick-to-select catalogue;
 * right pane is the running selection with − qty + steppers and a live total.
 */
export default function BulkAddItemsModal({
	items,
	loading,
	error,
	existingItemIds,
	onClose,
	onAdd,
}) {
	const [search, setSearch] = useState('');
	const [picked, setPicked] = useState({}); // item_id -> qty

	useEffect(() => {
		const prev = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		return () => {
			document.body.style.overflow = prev;
		};
	}, []);

	useEffect(() => {
		const onKey = (e) => e.key === 'Escape' && onClose();
		document.addEventListener('keydown', onKey);
		return () => document.removeEventListener('keydown', onKey);
	}, [onClose]);

	const filtered = useMemo(() => {
		const q = search.toLowerCase().trim();
		const list = q
			? items.filter(
					(i) =>
						(i.name || '').toLowerCase().includes(q) ||
						(i.sku || '').toLowerCase().includes(q),
				)
			: items;
		return list.slice(0, 300);
	}, [items, search]);

	const pickedList = useMemo(
		() =>
			Object.keys(picked)
				.map((id) => items.find((i) => i.item_id === id))
				.filter(Boolean),
		[picked, items],
	);

	const totalQty = Object.values(picked).reduce(
		(s, q) => s + (Number(q) || 0),
		0,
	);

	const toggle = (item) => {
		setPicked((prev) => {
			const next = { ...prev };
			if (next[item.item_id] !== undefined) delete next[item.item_id];
			else next[item.item_id] = 1;
			return next;
		});
	};

	const setQty = (itemId, qty) =>
		setPicked((prev) => ({ ...prev, [itemId]: Math.max(1, qty) }));

	const handleAdd = () =>
		onAdd(pickedList.map((item) => ({ item, quantity: picked[item.item_id] })));

	return (
		<div
			className="fixed inset-0 z-[80] flex items-center justify-center p-[30px]"
			style={{ background: 'rgba(20,30,50,.42)' }}
			onClick={(e) => e.target === e.currentTarget && onClose()}>
			<div className="w-[1000px] max-w-full h-[620px] max-h-[92vh] bg-surface rounded shadow-[0_30px_80px_rgba(10,20,40,.35)] flex flex-col overflow-hidden">
				{/* Header */}
				<div className="flex items-center justify-between px-5 py-[15px] bg-surface-2 border-b border-line">
					<div className="text-[16px] font-bold text-heading">
						Add Items in Bulk
					</div>
					<button
						onClick={onClose}
						className="w-[26px] h-[26px] rounded border border-danger-border bg-surface flex items-center justify-center cursor-pointer text-danger hover:bg-red-50">
						<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
							<path d="M6 6l12 12M18 6L6 18" />
						</svg>
					</button>
				</div>

				<div className="flex-1 flex min-h-0">
					{/* Left — catalogue */}
					<div className="w-1/2 border-r border-line-3 flex flex-col min-h-0">
						<div className="px-4 py-3.5">
							<div className="flex items-center gap-2 border border-line-2 rounded px-[11px] py-[9px]">
								<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#a7adb5" strokeWidth="2" className="flex-shrink-0">
									<circle cx="11" cy="11" r="7" />
									<path d="M21 21l-4-4" strokeLinecap="round" />
								</svg>
								<input
									autoFocus
									value={search}
									onChange={(e) => setSearch(e.target.value)}
									placeholder="Type to search or scan the barcode of the item"
									className="border-none outline-none text-[13px] w-full bg-transparent"
								/>
							</div>
						</div>

						<div className="flex-1 overflow-auto">
							{error ? (
								<p className="px-4 py-6 text-[13px] text-danger text-center">
									{error}
								</p>
							) : loading && items.length === 0 ? (
								<p className="px-4 py-6 text-[13px] text-muted-2 text-center">
									Loading items…
								</p>
							) : filtered.length === 0 ? (
								<p className="px-4 py-6 text-[13px] text-muted-2 text-center">
									No items match “{search}”
								</p>
							) : (
								filtered.map((item) => {
									const already = existingItemIds.has(item.item_id);
									const checked = picked[item.item_id] !== undefined;
									const stock = Number(
										item.available_stock ?? item.stock_on_hand ?? 0,
									);
									return (
										<div
											key={item.item_id}
											onClick={() => toggle(item)}
											className={`flex justify-between items-center px-4 py-[11px] cursor-pointer border-b border-[#f4f5f6] ${
												checked ? 'bg-row-selected' : 'hover:bg-surface-2'
											}`}>
											<div className="min-w-0">
												<div className="text-[13.5px] font-bold text-body truncate">
													{item.name}
													{already && (
														<span className="ml-1.5 text-[10px] font-bold text-warn-2 bg-warn-bg border border-warn-border rounded-[20px] px-1.5 py-px">
															on PO
														</span>
													)}
												</div>
												<div className="text-[11px] text-muted-2 mt-0.5 truncate">
													SKU: {item.sku || '—'} · Purchase Rate:{' '}
													{money(item.purchase_rate ?? item.rate)}
												</div>
											</div>
											<div className="flex items-center gap-3 pl-3">
												<div className="text-right whitespace-nowrap">
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
												<RoundCheck checked={checked} />
											</div>
										</div>
									);
								})
							)}
						</div>

						{loading && items.length > 0 && (
							<div className="px-4 py-2 text-[11.5px] text-muted-2 border-t border-line-4 num">
								Loading more… {items.length.toLocaleString('en-IN')} so far
							</div>
						)}
					</div>

					{/* Right — selection */}
					<div className="w-1/2 flex flex-col min-h-0">
						<div className="flex items-center justify-between px-5 pt-4 pb-3">
							<div className="flex items-center gap-2.5">
								<span className="text-[18px] font-bold text-heading">
									Selected Items
								</span>
								<span className="text-[12px] font-bold text-body-3 bg-line-4 rounded-[20px] px-2.5 py-0.5">
									{pickedList.length}
								</span>
							</div>
							<div className="text-[13px] text-muted num">
								Total Quantity: {totalQty.toLocaleString('en-IN')}
							</div>
						</div>

						<div className="flex-1 overflow-auto px-5">
							{pickedList.length === 0 ? (
								<div className="h-full flex items-center justify-center text-center text-muted-2 text-[13.5px] p-10">
									Click the item names from the left pane to select them
								</div>
							) : (
								pickedList.map((item) => (
									<div
										key={item.item_id}
										className="flex items-center justify-between py-3 border-b border-line-4 gap-3">
										<span className="text-[13.5px] text-body min-w-0 truncate">
											{item.name}
										</span>
										<div className="flex items-center border border-line-2 rounded overflow-hidden h-[34px] flex-shrink-0">
											<button
												onClick={() =>
													setQty(item.item_id, picked[item.item_id] - 1)
												}
												className="w-[34px] h-full border-none bg-surface-2 cursor-pointer text-body-3 text-[16px]">
												−
											</button>
											<input
												value={picked[item.item_id]}
												onChange={(e) =>
													setQty(
														item.item_id,
														parseInt(e.target.value, 10) || 1,
													)
												}
												className="num w-[52px] h-full border-none border-x border-line text-center text-[13.5px] outline-none"
											/>
											<button
												onClick={() =>
													setQty(item.item_id, picked[item.item_id] + 1)
												}
												className="w-[34px] h-full border-none bg-surface-2 cursor-pointer text-body-3 text-[16px]">
												+
											</button>
										</div>
									</div>
								))
							)}
						</div>
					</div>
				</div>

				{/* Footer */}
				<div className="flex gap-3 px-5 py-[15px] border-t border-line-3">
					<button
						onClick={handleAdd}
						disabled={pickedList.length === 0}
						className="h-[38px] px-5 rounded border border-brand bg-brand text-white font-bold text-[13px] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">
						Add Items
					</button>
					<button
						onClick={onClose}
						className="h-[38px] px-[18px] rounded border border-line-2 bg-surface text-body-2 font-bold text-[13px] cursor-pointer">
						Cancel
					</button>
				</div>
			</div>
		</div>
	);
}
