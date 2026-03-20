import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { fetchItems } from './ZohoAPI';
import ItemRow from './ItemRow';
import { logout } from '../App';

// Constants
const GROUP_BY_OPTIONS = {
	VENDOR: 'vendor',
	BRAND: 'brand',
	MANUFACTURER: 'manufacturer',
};

const UNKNOWN_VALUES = {
	[GROUP_BY_OPTIONS.VENDOR]: 'Unknown Vendor',
	[GROUP_BY_OPTIONS.BRAND]: 'Unknown Brand',
	[GROUP_BY_OPTIONS.MANUFACTURER]: 'Unknown Manufacturer',
};

export default function ZohoItemsTable() {
	const [items, setItems] = useState([]);
	const [expandedGroups, setExpandedGroups] = useState({});
	const [groupBy, setGroupBy] = useState(GROUP_BY_OPTIONS.VENDOR);

	const selectedItems = useMemo(
		() => items.filter((item) => item.selected),
		[items]
	);

	const allChecked = useMemo(
		() => items.length > 0 && items.every((item) => item.selected),
		[items]
	);

	const getGroupKey = useCallback(
		(item) => {
			switch (groupBy) {
				case GROUP_BY_OPTIONS.BRAND:
					return item.brand || UNKNOWN_VALUES[GROUP_BY_OPTIONS.BRAND];
				case GROUP_BY_OPTIONS.MANUFACTURER:
					return (
						item.manufacturer || UNKNOWN_VALUES[GROUP_BY_OPTIONS.MANUFACTURER]
					);
				default:
					return item.vendor_name || UNKNOWN_VALUES[GROUP_BY_OPTIONS.VENDOR];
			}
		},
		[groupBy]
	);

	const groupedItems = useMemo(() => {
		return items.reduce((acc, item) => {
			const key = getGroupKey(item);
			if (!acc[key]) acc[key] = [];
			acc[key].push(item);
			return acc;
		}, {});
	}, [items, getGroupKey]);

	useEffect(() => {
		const loadItems = async () => {
			try {
				const fetchedItems = await fetchItems();
				setItems(fetchedItems);
				const collapsed = {};
				fetchedItems.forEach((item) => {
					const groupKey = getGroupKey(item);
					collapsed[groupKey] = false;
				});
				setExpandedGroups(collapsed);
			} catch (error) {
				console.error('Failed to load items:', error);
			}
		};
		loadItems();
	}, [groupBy, getGroupKey]);

	useEffect(() => {
		Object.entries(groupedItems).forEach(([groupValue, groupItems]) => {
			const input = document.getElementById(`group-checkbox-${groupValue}`);
			if (input) {
				const someSelected = groupItems.some((item) => item.selected);
				const allSelected = groupItems.every((item) => item.selected);
				input.indeterminate = someSelected && !allSelected;
			}
		});
	}, [groupedItems]);

	useEffect(() => {
		const handleKeyDown = (e) => {
			if (e.key === 'Escape') {
				handleClearSelection();
			}
		};
		window.addEventListener('keydown', handleKeyDown);
		return () => window.removeEventListener('keydown', handleKeyDown);
	}, []);

	const toggleSelect = useCallback((id) => {
		setItems((prev) =>
			prev.map((item) =>
				item.item_id === id ? { ...item, selected: !item.selected } : item
			)
		);
	}, []);

	const toggleSelectAll = useCallback((checked) => {
		setItems((prev) => prev.map((item) => ({ ...item, selected: checked })));
	}, []);

	const toggleSelectGroup = useCallback(
		(groupValue, checked) => {
			setItems((prev) =>
				prev.map((item) =>
					getGroupKey(item) === groupValue
						? { ...item, selected: checked }
						: item
				)
			);
		},
		[getGroupKey]
	);

	const toggleGroupCollapse = useCallback((groupValue) => {
		setExpandedGroups((prev) => ({
			...prev,
			[groupValue]: !prev[groupValue],
		}));
	}, []);

	const handleLogout = useCallback(() => {
		logout();
	}, []);

	const handleCreatePO = useCallback(() => {
		alert(`${selectedItems.length} item(s) selected for Purchase Order`);
	}, [selectedItems.length]);

	const handleClearSelection = useCallback(() => {
		setItems((prev) => prev.map((item) => ({ ...item, selected: false })));
	}, []);

	const handleGroupByChange = useCallback((e) => {
		setGroupBy(e.target.value);
	}, []);

	const renderGroupRow = (groupValue, groupItems) => {
		const isExpanded = expandedGroups[groupValue] ?? false;
		const allGroupSelected = groupItems.every((item) => item.selected);
		return (
			<React.Fragment key={groupValue}>
				<tr>
					<td className="p-2 bg-gray-100 w-[40px] text-center">
						<input
							id={`group-checkbox-${groupValue}`}
							type="checkbox"
							checked={allGroupSelected}
							onChange={(e) => toggleSelectGroup(groupValue, e.target.checked)}
							onClick={(e) => e.stopPropagation()}
							className="form-checkbox h-4 w-4 text-blue-600"
							aria-label={`Select all items in ${groupValue}`}
						/>
					</td>
					<td
						colSpan={8}
						className="p-2 bg-gray-100 text-left cursor-pointer select-none hover:bg-gray-200"
						onClick={() => toggleGroupCollapse(groupValue)}>
						<div className="flex items-center gap-2 font-medium text-gray-800">
							<span className="text-lg" aria-hidden="true">
								{isExpanded ? '▼' : '▶'}
							</span>
							<span>{groupValue}</span>
						</div>
					</td>
				</tr>
				{isExpanded &&
					groupItems.map((item) => (
						<ItemRow
							key={item.item_id}
							item={item}
							toggleSelect={toggleSelect}
						/>
					))}
			</React.Fragment>
		);
	};

	return (
		<div className="relative bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden">
			<div className="p-6 flex justify-between items-center border-b border-gray-100">
				<h1 className="text-xl font-semibold text-gray-800">Low Stock Items</h1>
				<div className="flex items-center gap-4">
					<div className="relative">
						<select
							value={groupBy}
							onChange={handleGroupByChange}
							className="border border-gray-300 px-4 py-2.5 rounded-lg text-sm bg-white shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 appearance-none pr-10">
							<option value={GROUP_BY_OPTIONS.VENDOR}>Group by Vendor</option>
							<option value={GROUP_BY_OPTIONS.BRAND}>Group by Brand</option>
							<option value={GROUP_BY_OPTIONS.MANUFACTURER}>
								Group by Manufacturer
							</option>
						</select>
						<div className="absolute inset-y-0 right-0 flex items-center px-3 pointer-events-none">
							<svg
								className="w-4 h-4 text-gray-400"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24">
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2}
									d="M19 9l-7 7-7-7"
								/>
							</svg>
						</div>
					</div>
					<button
						onClick={handleLogout}
						className="bg-red-500 hover:bg-red-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium shadow-sm transition-all duration-200 hover:shadow-md transform hover:scale-105">
						Logout
					</button>
				</div>
			</div>
			{selectedItems.length > 0 && (
				<div className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-gray-300 shadow px-4 py-2 text-sm flex items-center justify-between">
					<button
						onClick={handleCreatePO}
						className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded text-sm font-medium">
						Create Purchase Order
					</button>
					<div className="absolute left-1/2 transform -translate-x-1/2 text-gray-700 font-medium text-sm">
						{selectedItems.length} Selected
					</div>
					<button
						onClick={handleClearSelection}
						className="text-gray-400 hover:text-gray-600 text-lg leading-none">
						&#x2715; <span className="text-sm ml-1">Esc</span>
					</button>
				</div>
			)}
			<div className="overflow-x-auto">
				<table className="min-w-full table-fixed border-collapse text-sm text-gray-700">
					<thead className="bg-gray-50">
						<tr>
							<th className="p-2 w-10">
								<input
									id="select-all"
									type="checkbox"
									checked={allChecked}
									onChange={(e) => toggleSelectAll(e.target.checked)}
									className="form-checkbox h-4 w-4 text-blue-600"
									aria-label="Select All"
								/>
							</th>
							<th className="p-2 text-left">Item Name</th>
							<th className="p-2 text-left">SKU</th>
							<th className="p-2 text-right">Rate</th>
							<th className="p-2 text-left">Unit</th>
							<th className="p-2 text-left">HSN/SAC</th>
							<th className="p-2 text-right">Max Capacity</th>
							<th className="p-2 text-right">Stock on Hand</th>
							<th className="p-2 text-right">Raw Qty Order</th>
						</tr>
					</thead>
					<tbody className="divide-y divide-gray-100">
						{Object.entries(groupedItems).map(([groupValue, groupItems]) =>
							renderGroupRow(groupValue, groupItems)
						)}
					</tbody>
				</table>
			</div>
		</div>
	);
}
