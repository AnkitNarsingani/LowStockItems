import React, {
	useEffect,
	useState,
	useCallback,
	useMemo,
	useRef,
} from 'react';
import { fetchItems, createPurchaseOrder } from './ZohoAPI';
import { logout } from '../App';
import ItemRow from './ItemRow';
import VendorSelectModal from './VendorSelectModal';
import CreatePOModal from './CreatePOModal';
import './ItemRow.css';

const GROUP_BY_OPTIONS = {
	VENDOR: 'vendor',
	BRAND: 'brand',
	MANUFACTURER: 'manufacturer',
};

const UNKNOWN_VALUES = {
	vendor: 'Unknown Vendor',
	brand: 'Unknown Brand',
	manufacturer: 'Unknown Manufacturer',
};

export default function ZohoItemsTable() {
	const [items, setItems] = useState([]);
	const [groupBy, setGroupBy] = useState(GROUP_BY_OPTIONS.VENDOR);
	const [search, setSearch] = useState('');
	const [expandedGroups, setExpandedGroups] = useState(new Set());
	const [loading, setLoading] = useState(true);
	const [loadedCount, setLoadedCount] = useState(0);
	const [totalCount, setTotalCount] = useState(0);

	// Selection state
	const [selectedItemIds, setSelectedItemIds] = useState(new Set());

	// PO creation state
	const [showCreatePOModal, setShowCreatePOModal] = useState(false);
	const [showVendorModal, setShowVendorModal] = useState(false);
	const [creatingPO, setCreatingPO] = useState(false);
	const [poResult, setPoResult] = useState(null);

	const itemCacheRef = useRef(null);
	const pendingPOOptsRef = useRef({ bundleSize: 0, populateRate: false });

	const getGroupKey = useCallback(
		(item) => {
			switch (groupBy) {
				case 'brand':
					return item.brand || UNKNOWN_VALUES.brand;
				case 'manufacturer':
					return item.manufacturer || UNKNOWN_VALUES.manufacturer;
				default:
					return item.vendor_name || UNKNOWN_VALUES.vendor;
			}
		},
		[groupBy],
	);

	const filteredItems = useMemo(() => {
		const q = search.toLowerCase().trim();
		return items.filter(
			(item) =>
				!q ||
				(item.name || '').toLowerCase().includes(q) ||
				(item.sku || '').toLowerCase().includes(q),
		);
	}, [items, search]);

	const groupedItems = useMemo(() => {
		return filteredItems.reduce((acc, item) => {
			const key = getGroupKey(item);
			if (!acc[key]) acc[key] = [];
			acc[key].push(item);
			return acc;
		}, {});
	}, [filteredItems, getGroupKey]);

	const metrics = useMemo(() => {
		const groups = new Set(items.map((i) => getGroupKey(i))).size;
		return { total: items.length, groups };
	}, [items, getGroupKey]);

	const toggleGroup = useCallback((group) => {
		setExpandedGroups((prev) => {
			const next = new Set(prev);
			next.has(group) ? next.delete(group) : next.add(group);
			return next;
		});
	}, []);

	// Selection handlers
	const toggleSelect = useCallback((itemId) => {
		setSelectedItemIds((prev) => {
			const next = new Set(prev);
			next.has(itemId) ? next.delete(itemId) : next.add(itemId);
			return next;
		});
	}, []);

	const allFilteredSelected =
		filteredItems.length > 0 &&
		filteredItems.every((item) => selectedItemIds.has(item.item_id));

	const someFilteredSelected =
		filteredItems.some((item) => selectedItemIds.has(item.item_id)) &&
		!allFilteredSelected;

	const toggleSelectAll = useCallback(() => {
		setSelectedItemIds((prev) => {
			const next = new Set(prev);
			if (filteredItems.every((item) => next.has(item.item_id))) {
				filteredItems.forEach((item) => next.delete(item.item_id));
			} else {
				filteredItems.forEach((item) => next.add(item.item_id));
			}
			return next;
		});
	}, [filteredItems]);

	// Selected items derived from current items list
	const selectedItems = useMemo(
		() => items.filter((item) => selectedItemIds.has(item.item_id)),
		[items, selectedItemIds],
	);

	// PO creation — defined first so handleCreatePOClick can safely reference it
	const doCreatePO = useCallback(
		async (vendorId, itemsForPO, bundle, populateRate) => {
			setCreatingPO(true);
			setPoResult(null);
			try {
				const bundleNum = Number(bundle) > 0 ? Number(bundle) : 0;
				const po = await createPurchaseOrder(vendorId, itemsForPO, bundleNum, populateRate);
				setPoResult({
					success: true,
					message: `Purchase Order ${po.purchaseorder_number || ''} created in draft.`,
					poId: po.purchaseorder_id,
				});
				setSelectedItemIds(new Set());
				setShowVendorModal(false);
			} catch (err) {
				setPoResult({ success: false, message: err.message || 'Failed to create PO.' });
				setShowVendorModal(false);
			} finally {
				setCreatingPO(false);
			}
		},
		[],
	);

	// Step 1: open the options modal
	const handleCreatePOClick = useCallback(() => {
		if (selectedItems.length === 0) return;
		setShowCreatePOModal(true);
	}, [selectedItems]);

	// Step 2: options confirmed → check vendors
	const handleCreatePOConfirm = useCallback(({ bundleSize: bs, populateRate: pr }) => {
		pendingPOOptsRef.current = { bundleSize: bs, populateRate: pr };
		setShowCreatePOModal(false);

		const uniqueVendorIds = new Set(
			selectedItems.map((i) => i.vendor_id).filter(Boolean),
		);

		if (uniqueVendorIds.size === 1) {
			const vendorId = [...uniqueVendorIds][0];
			doCreatePO(vendorId, selectedItems, bs, pr);
		} else {
			setShowVendorModal(true);
		}
	}, [selectedItems, doCreatePO]);

	useEffect(() => {
		const loadItems = async () => {
			if (itemCacheRef.current) {
				setItems(itemCacheRef.current.items);
				setLoadedCount(itemCacheRef.current.total);
				setTotalCount(itemCacheRef.current.total);
				setLoading(false);
				return;
			}

			setLoading(true);
			setItems([]);
			setLoadedCount(0);
			setTotalCount(0);

			let lastTotal = 0;
			await fetchItems((partialItems, total) => {
				setItems(partialItems);
				setLoadedCount(partialItems.length);
				setTotalCount(total);
				lastTotal = total;
			});

			setItems((final) => {
				itemCacheRef.current = { items: final, total: lastTotal };
				return final;
			});

			setLoading(false);
		};

		loadItems();
	}, []);

	const groupByLabel =
		groupBy === 'brand'
			? 'Brands'
			: groupBy === 'manufacturer'
				? 'Manufacturers'
				: 'Vendors';

	return (
		<div className="flex flex-col bg-white rounded-xl border border-gray-200 overflow-hidden w-full h-full">
			{/* TOOLBAR */}
			<div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 flex-wrap gap-2">
				<div className="flex items-center gap-2">
					<h1 className="text-sm font-medium text-gray-900">Low stock items</h1>
					<span className="text-xs bg-gray-100 text-gray-500 border border-gray-200 rounded-full px-2 py-0.5">
						{filteredItems.length} items
					</span>
					{selectedItemIds.size > 0 && (
						<span className="text-xs bg-blue-50 text-blue-600 border border-blue-200 rounded-full px-2 py-0.5">
							{selectedItemIds.size} selected
						</span>
					)}
				</div>

				<div className="flex items-center gap-2 flex-wrap">
					{/* Create PO — visible when ≥1 item selected */}
					{selectedItemIds.size >= 1 && (
						<button
							onClick={handleCreatePOClick}
							disabled={creatingPO}
							className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
							{creatingPO ? (
								<>
									<span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
									Creating…
								</>
							) : (
								<>
									<svg className="w-3 h-3" viewBox="0 0 16 16" fill="none">
										<path
											d="M8 3v10M3 8h10"
											stroke="currentColor"
											strokeWidth="1.75"
											strokeLinecap="round"
										/>
									</svg>
									Create PO
								</>
							)}
						</button>
					)}

					<div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5">
						<svg
							className="w-3 h-3 text-gray-400 flex-shrink-0"
							viewBox="0 0 16 16"
							fill="none">
							<circle
								cx="6.5"
								cy="6.5"
								r="5"
								stroke="currentColor"
								strokeWidth="1.5"
							/>
							<path
								d="M10.5 10.5L14 14"
								stroke="currentColor"
								strokeWidth="1.5"
								strokeLinecap="round"
							/>
						</svg>
						<input
							type="text"
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							placeholder="Search items…"
							className="bg-transparent text-xs text-gray-700 placeholder-gray-400 outline-none w-32"
						/>
					</div>

					<div className="relative">
						<select
							value={groupBy}
							onChange={(e) => {
								setGroupBy(e.target.value);
								setExpandedGroups(new Set());
							}}
							className="text-xs border border-gray-200 rounded-lg pl-2.5 pr-6 py-1.5 bg-white text-gray-700 appearance-none cursor-pointer outline-none focus:ring-1 focus:ring-blue-200">
							<option value="vendor">Vendor</option>
							<option value="brand">Brand</option>
							<option value="manufacturer">Manufacturer</option>
						</select>
						<ChevronIcon />
					</div>

					<button
						onClick={logout}
						className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-700 cursor-pointer outline-none hover:bg-gray-50">
						Logout
					</button>
				</div>
			</div>

			{/* PO result notification */}
			{poResult && (
				<div
					className={`flex items-center justify-between px-4 py-2.5 text-xs border-b ${
						poResult.success
							? 'bg-green-50 border-green-100 text-green-700'
							: 'bg-red-50 border-red-100 text-red-600'
					}`}>
					<span>{poResult.message}</span>
					<button
						onClick={() => setPoResult(null)}
						className="ml-4 opacity-60 hover:opacity-100">
						✕
					</button>
				</div>
			)}

			{/* METRIC CARDS */}
			<div className="grid grid-cols-2 gap-2.5 px-4 py-3 border-b border-gray-100">
				<MetricCard label="Total SKUs" value={metrics.total} color="default" />
				<MetricCard label={groupByLabel} value={metrics.groups} color="green" />
			</div>

			{/* Loading bar */}
			{loading && (
				<div className="px-4 py-2.5 border-b border-gray-100">
					<div className="flex justify-between items-center mb-1.5">
						<span className="text-xs text-gray-500">Loading inventory…</span>
						<span className="text-xs font-medium text-gray-700 tabular-nums">
							{loadedCount.toLocaleString()} / {totalCount.toLocaleString()}{' '}
							items loaded
						</span>
					</div>
					<div className="relative w-full h-0.5 bg-gray-100 rounded-full overflow-hidden">
						<div
							className="progress-bounce absolute h-full bg-blue-500 rounded-full"
							style={{ width: '35%' }}
						/>
					</div>
				</div>
			)}

			{/* TABLE */}
			<div className="overflow-auto flex-1">
				<table className="w-full text-xs">
					<thead>
						<tr className="sticky top-0 z-10 bg-white border-b border-gray-100">
							<th className="w-9 p-2 text-center">
								<input
									type="checkbox"
									checked={allFilteredSelected}
									ref={(el) => {
										if (el) el.indeterminate = someFilteredSelected;
									}}
									onChange={toggleSelectAll}
									disabled={filteredItems.length === 0}
									className="form-checkbox h-3.5 w-3.5 text-blue-500 rounded cursor-pointer disabled:cursor-not-allowed"
								/>
							</th>
							<th className="p-2 text-left font-medium text-gray-500 w-48">
								Item name
							</th>
							<th className="p-2 text-left font-medium text-gray-500 w-28">
								SKU
							</th>
							<th className="p-2 text-right font-medium text-gray-500 w-24">
								Rate
							</th>
							<th className="p-2 text-left font-medium text-gray-500 w-16">
								Unit
							</th>
							<th className="p-2 text-left font-medium text-gray-500 w-24">
								HSN / SAC
							</th>
							<th className="p-2 text-right font-medium text-gray-500 w-24">
								Reorder qty
							</th>
							<th className="p-2 text-right font-medium text-gray-500 w-24">
								Max cap.
							</th>
							<th className="p-2 text-right font-medium text-gray-500 w-24">
								On hand
							</th>
						</tr>
					</thead>

					<tbody>
						{Object.entries(groupedItems).map(([group, groupItems]) => {
							const isCollapsed = !expandedGroups.has(group);
							return (
								<React.Fragment key={group}>
									<tr
										className="bg-gray-50 border-t border-b border-gray-100 cursor-pointer select-none hover:bg-gray-100 transition-colors"
										onClick={() => toggleGroup(group)}>
										<td colSpan={9} className="px-3 py-1.5">
											<div className="flex items-center gap-1.5">
												<svg
													className="w-3 h-3 text-gray-400 flex-shrink-0 transition-transform duration-150"
													style={{
														transform: isCollapsed
															? 'rotate(-90deg)'
															: 'rotate(0deg)',
													}}
													viewBox="0 0 12 12"
													fill="none">
													<path
														d="M2 4l4 4 4-4"
														stroke="currentColor"
														strokeWidth="1.5"
														strokeLinecap="round"
														strokeLinejoin="round"
													/>
												</svg>
												<span className="text-xs font-medium text-gray-500 tracking-wide">
													{group}
												</span>
												<span className="text-xs font-normal text-gray-400 ml-0.5">
													{groupItems.length} item
													{groupItems.length !== 1 ? 's' : ''}
												</span>
											</div>
										</td>
									</tr>

									{!isCollapsed &&
										groupItems.map((item) => (
											<ItemRow
												key={item.item_id}
												item={{ ...item, selected: selectedItemIds.has(item.item_id) }}
												toggleSelect={toggleSelect}
											/>
										))}
								</React.Fragment>
							);
						})}

						{loading && items.length === 0 && (
							<>
								{[80, 65, 72, 55, 88].map((w, i) => (
									<tr key={i} className="border-b border-gray-50">
										<td colSpan={9} className="px-3 py-2.5">
											<div
												className="h-3 rounded bg-gray-100 animate-pulse"
												style={{ width: `${w}%` }}
											/>
										</td>
									</tr>
								))}
							</>
						)}

						{loading && items.length > 0 && (
							<tr className="border-t border-dashed border-gray-100">
								<td
									colSpan={9}
									className="px-3 py-2 text-center text-xs text-gray-400">
									<span className="inline-flex items-center gap-1.5">
										<span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-ping" />
										Fetching more items…
									</span>
								</td>
							</tr>
						)}

						{!loading && filteredItems.length === 0 && (
							<tr>
								<td
									colSpan={9}
									className="py-10 text-center text-xs text-gray-400">
									No items match your filters
								</td>
							</tr>
						)}
					</tbody>
				</table>
			</div>

			{/* Step 1: PO options modal (simple vs bundle) */}
			{showCreatePOModal && (
				<CreatePOModal
					selectedCount={selectedItems.length}
					selectedItems={selectedItems}
					onClose={() => setShowCreatePOModal(false)}
					onConfirm={handleCreatePOConfirm}
				/>
			)}

			{/* Step 2: Vendor selection modal (when multiple vendors) */}
			{showVendorModal && (
				<VendorSelectModal
					selectedItems={selectedItems}
					onClose={() => !creatingPO && setShowVendorModal(false)}
					onConfirm={(vendorId) => doCreatePO(
				vendorId,
				selectedItems,
				pendingPOOptsRef.current.bundleSize,
				pendingPOOptsRef.current.populateRate,
			)}
					creating={creatingPO}
				/>
			)}
		</div>
	);
}

function MetricCard({ label, value, color }) {
	const valColor =
		color === 'red'
			? 'text-red-500'
			: color === 'green'
				? 'text-green-700'
				: 'text-gray-900';
	return (
		<div className="bg-gray-50 rounded-lg px-3 py-2.5">
			<p className="text-xs text-gray-500 mb-1">{label}</p>
			<p className={`text-xl font-medium tabular-nums ${valColor}`}>
				{value ?? '—'}
			</p>
		</div>
	);
}

function ChevronIcon() {
	return (
		<svg
			className="w-3 h-3 text-gray-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none"
			viewBox="0 0 12 12"
			fill="none">
			<path
				d="M2 4l4 4 4-4"
				stroke="currentColor"
				strokeWidth="1.5"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}
