import React, {
	useEffect,
	useState,
	useCallback,
	useMemo,
	useSyncExternalStore,
} from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
	subscribe as subscribeToLoad,
	getState as getLoadState,
	startLoad,
} from '../lib/lowStockRun';
import ItemRow, { LOW_TABLE_COLS } from './ItemRow';
import Checkbox from './Checkbox';
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

const GROUP_TABS = [
	{ id: GROUP_BY_OPTIONS.VENDOR, label: 'Vendor' },
	{ id: GROUP_BY_OPTIONS.BRAND, label: 'Brand' },
	{ id: GROUP_BY_OPTIONS.MANUFACTURER, label: 'Manufacturer' },
];

export default function ZohoItemsTable() {
	const navigate = useNavigate();
	const location = useLocation();

	// The New PO page closes itself on success and hands the confirmation over
	// through router state.
	const [poResult, setPoResult] = useState(null);

	// The load lives outside React so it survives navigating away — see
	// src/lib/lowStockRun.js.
	const load = useSyncExternalStore(subscribeToLoad, getLoadState);
	const items = load.items;
	const loading = load.phase === 'loading';
	const loadedCount = load.loaded;
	const totalCount = load.total;

	const [groupBy, setGroupBy] = useState(GROUP_BY_OPTIONS.VENDOR);
	const [search, setSearch] = useState('');
	// Groups start collapsed, so the page opens as a short list of groups rather
	// than every item at once. Tracking the *expanded* ones means an empty set is
	// the default state, and a change of grouping collapses everything again.
	const [expandedGroups, setExpandedGroups] = useState(new Set());

	const [selectedItemIds, setSelectedItemIds] = useState(new Set());

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

	const groupKeys = Object.keys(groupedItems);
	const allCollapsed =
		groupKeys.length > 0 && groupKeys.every((k) => !expandedGroups.has(k));

	const toggleExpandAll = useCallback(() => {
		setExpandedGroups((prev) => {
			const keys = Object.keys(groupedItems);
			const anyExpanded = keys.some((k) => prev.has(k));
			return anyExpanded ? new Set() : new Set(keys);
		});
	}, [groupedItems]);

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
		!allFilteredSelected &&
		filteredItems.some((item) => selectedItemIds.has(item.item_id));

	// Whole-group selection from the group header.
	const toggleGroupSelection = useCallback((groupItems) => {
		setSelectedItemIds((prev) => {
			const next = new Set(prev);
			const allIn = groupItems.every((i) => next.has(i.item_id));
			if (allIn) groupItems.forEach((i) => next.delete(i.item_id));
			else groupItems.forEach((i) => next.add(i.item_id));
			return next;
		});
	}, []);

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

	const selectedItems = useMemo(
		() => items.filter((item) => selectedItemIds.has(item.item_id)),
		[items, selectedItemIds],
	);

	// Carry the selection to the New PO page via router state, with the ids also
	// in the query string so a hard refresh can re-fetch them from Zoho.
	const openNewPO = useCallback(
		(withSelection) => {
			if (!withSelection || selectedItems.length === 0) {
				navigate('/po/new');
				return;
			}
			const ids = selectedItems.map((i) => i.item_id).join(',');
			navigate(`/po/new?items=${encodeURIComponent(ids)}`, {
				state: { items: selectedItems },
			});
		},
		[navigate, selectedItems],
	);

	useEffect(() => {
		const handed = location.state?.poResult;
		if (!handed) return;
		setPoResult(handed);
		// Clear the state so a refresh or a Back does not replay the banner.
		navigate(location.pathname, { replace: true, state: null });
	}, [location.state, location.pathname, navigate]);

	// Kick the shared load off; it no-ops when one is already running or done.
	useEffect(() => {
		startLoad();
	}, []);

	const groupMetricLabel =
		groupBy === 'brand'
			? 'Brands'
			: groupBy === 'manufacturer'
				? 'Manufacturers'
				: 'Vendors';

	return (
		<div className="px-7 pt-[22px] pb-[70px]">
			{/* Title row */}
			<div className="flex items-center gap-3 mb-1 flex-wrap">
				<div className="text-[20px] font-bold text-heading">
					Low stock items
				</div>
				<div className="flex-1" />

				{/* One button, not two: with rows selected the useful action is a PO
				    for that selection, so it takes the New button's place. */}
				{selectedItemIds.size > 0 ? (
					<button
						onClick={() => openNewPO(true)}
						className="h-9 px-4 rounded border border-brand bg-brand text-white font-bold text-[13px] cursor-pointer flex items-center gap-[7px]">
						Create PO
						<span className="bg-white/25 rounded-[20px] px-2 py-px text-[12px] num">
							{selectedItemIds.size}
						</span>
					</button>
				) : (
					<button
						onClick={() => openNewPO(false)}
						className="h-9 px-[15px] rounded border border-brand bg-brand text-white font-bold text-[13px] cursor-pointer flex items-center gap-1.5">
						<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4">
							<path d="M12 5v14M5 12h14" strokeLinecap="round" />
						</svg>
						New
					</button>
				)}
			</div>

			{/* Toolbar */}
			<div className="flex items-center gap-2.5 mt-3.5 mb-3.5 flex-wrap">
				<div className="flex items-center gap-2 border border-line-2 rounded-lg bg-surface px-[11px] h-9 w-60 max-w-full">
					<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#a7adb5" strokeWidth="2" className="flex-shrink-0">
						<circle cx="11" cy="11" r="7" />
						<path d="M21 21l-4-4" strokeLinecap="round" />
					</svg>
					<input
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						placeholder="Search items…"
						className="border-none outline-none text-[13px] w-full bg-transparent"
					/>
				</div>

				<div className="flex-1" />

				<span className="text-[12px] text-muted font-bold">Group by</span>
				<div className="flex bg-surface-2 border border-line rounded-lg p-[3px] gap-0.5">
					{GROUP_TABS.map((t) => (
						<button
							key={t.id}
							onClick={() => {
								setGroupBy(t.id);
								setExpandedGroups(new Set());
							}}
							className={`border-none px-3 py-[5px] rounded text-[12.5px] font-bold cursor-pointer whitespace-nowrap ${
								groupBy === t.id
									? 'bg-surface text-link shadow-[0_1px_2px_rgba(20,30,50,.12)]'
									: 'bg-transparent text-muted hover:text-body-3'
							}`}>
							{t.label}
						</button>
					))}
				</div>

				<button
					onClick={toggleExpandAll}
					className="h-9 px-[13px] rounded-lg border border-line-2 bg-surface text-body-3 font-bold text-[12.5px] cursor-pointer w-20">
					{allCollapsed ? 'Expand' : 'Collapse'}
				</button>
			</div>

			{/* Confirmation handed over by the New PO page */}
			{poResult && (
				<div
					className={`flex items-center justify-between gap-3 px-4 py-2.5 mb-3.5 rounded-[10px] border text-[13px] ${
						poResult.success
							? 'bg-green-50 border-green-200 text-ok'
							: 'bg-red-50 border-danger-border text-danger'
					}`}>
					<span className="flex items-center gap-2 min-w-0">
						{poResult.success && (
							<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" className="flex-shrink-0">
								<path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
							</svg>
						)}
						<span className="truncate">{poResult.message}</span>
					</span>
					<span className="flex items-center gap-3 flex-shrink-0">
						{poResult.poId && (
							<button
								onClick={() =>
									window.open(
										`https://books.zoho.com/app#/purchaseorders/${poResult.poId}`,
										'_blank',
									)
								}
								className="font-bold underline bg-transparent border-none cursor-pointer text-current p-0">
								View in Zoho
							</button>
						)}
						<button
							onClick={() => setPoResult(null)}
							aria-label="Dismiss"
							className="opacity-60 hover:opacity-100 bg-transparent border-none cursor-pointer text-current">
							✕
						</button>
					</span>
				</div>
			)}

			{/* Metric cards */}
			<div className="flex gap-4 mb-[18px]">
				<MetricCard label="Total SKUs" value={metrics.total} />
				<MetricCard label={groupMetricLabel} value={metrics.groups} accent />
			</div>

			{/* Loading bar */}
			{loading && (
				<div className="bg-surface border border-line rounded-[10px] px-[18px] py-3 mb-3">
					<div className="flex justify-between items-center mb-1.5">
						<span className="text-[12.5px] text-muted">Loading inventory…</span>
						<span className="text-[12.5px] font-bold text-body-3 num">
							{loadedCount.toLocaleString()} / {totalCount.toLocaleString()}{' '}
							items loaded
						</span>
					</div>
					<div className="relative w-full h-[3px] bg-line-4 rounded-full overflow-hidden">
						<div
							className="progress-bounce absolute h-full bg-brand rounded-full"
							style={{ width: '35%' }}
						/>
					</div>
				</div>
			)}

			{/* Table */}
			<div className="bg-surface border border-line rounded-[10px] overflow-hidden">
				<div
					className="grid px-[18px] py-3 bg-surface-2 border-b border-line text-[10.5px] font-bold text-muted tracking-[.04em] items-center"
					style={{ gridTemplateColumns: LOW_TABLE_COLS }}>
					<div>
						<Checkbox
							checked={allFilteredSelected}
							indeterminate={someFilteredSelected}
							onChange={toggleSelectAll}
							disabled={filteredItems.length === 0}
							label="Select all items"
						/>
					</div>
					<div>NAME</div>
					<div>SKU</div>
					<div className="text-right pr-2.5">RATE</div>
					<div className="text-right pr-2.5">STOCK ON HAND</div>
					<div className="text-right pr-2.5">REORDER LEVEL</div>
					<div className="text-right pr-2.5">MAXIMUM CAPACITY</div>
					<div>USAGE UNIT</div>
				</div>

				{Object.entries(groupedItems).map(([group, groupItems]) => {
					const expanded = expandedGroups.has(group);
					const groupAll =
						groupItems.length > 0 &&
						groupItems.every((i) => selectedItemIds.has(i.item_id));
					const groupSome =
						!groupAll && groupItems.some((i) => selectedItemIds.has(i.item_id));
					return (
						<React.Fragment key={group}>
							<div
								onClick={() => toggleGroup(group)}
								className="flex items-center gap-[9px] px-[18px] py-2.5 bg-surface-2 border-t border-b border-line-3 cursor-pointer select-none hover:bg-[#eef1f4]">
								{/* Sits at the same offset as the row checkboxes below it. */}
								<Checkbox
									checked={groupAll}
									indeterminate={groupSome}
									onChange={() => toggleGroupSelection(groupItems)}
									label={`Select all items in ${group}`}
								/>
								<svg
									width="12"
									height="12"
									viewBox="0 0 12 12"
									fill="none"
									className="flex-shrink-0 transition-transform duration-150"
									style={{
										transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)',
									}}>
									<path
										d="M2 4l4 4 4-4"
										stroke="#8b919a"
										strokeWidth="1.6"
										strokeLinecap="round"
										strokeLinejoin="round"
									/>
								</svg>
								<span className="text-[12.5px] font-bold text-body-2">
									{group}
								</span>
								<span className="text-[12px] text-muted-2">
									{groupItems.length} item{groupItems.length !== 1 ? 's' : ''}
								</span>
								<div className="flex-1" />
								<span className="text-[11px] font-bold text-warn bg-warn-bg border border-warn-border rounded-[20px] px-[9px] py-px">
									{groupItems.length} low
								</span>
							</div>

							{expanded &&
								groupItems.map((item) => (
									<ItemRow
										key={item.item_id}
										item={item}
										selected={selectedItemIds.has(item.item_id)}
										toggleSelect={toggleSelect}
									/>
								))}
						</React.Fragment>
					);
				})}

				{loading && items.length === 0 && (
					<div className="px-[18px] py-3">
						{[80, 65, 72, 55, 88].map((w, i) => (
							<div
								key={i}
								className="h-3 rounded bg-line-4 animate-pulse my-3"
								style={{ width: `${w}%` }}
							/>
						))}
					</div>
				)}

				{loading && items.length > 0 && (
					<div className="px-[18px] py-2.5 text-center text-[12.5px] text-muted-2 border-t border-dashed border-line-3">
						<span className="inline-flex items-center gap-1.5">
							<span className="w-1.5 h-1.5 rounded-full bg-brand animate-ping" />
							Fetching more items…
						</span>
					</div>
				)}

				{!loading && filteredItems.length === 0 && (
					<div className="p-10 text-center text-muted-2 text-[13px]">
						No items match your search.
					</div>
				)}
			</div>
		</div>
	);
}

function MetricCard({ label, value, accent }) {
	return (
		<div className="flex-1 bg-surface-3 border border-line rounded-[10px] px-5 py-[18px] text-center">
			<div className="text-[13px] text-muted mb-1.5">{label}</div>
			<div
				className={`num text-[26px] font-black ${accent ? 'text-ok' : 'text-heading'}`}>
				{value ?? '—'}
			</div>
		</div>
	);
}
