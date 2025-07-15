import React, { useEffect, useState } from 'react';
import { fetchItems } from './ZohoAPI';
import ItemRow from './ItemRow';
import { logout } from '../App';

export default function ZohoItemsTable() {
	const [items, setItems] = useState([]);
	const [expandedGroups, setExpandedGroups] = useState({});

	// Group items by vendor
	const groupedItems = items.reduce((acc, item) => {
		const vendor = item.vendor_name || 'Unknown Vendor';
		if (!acc[vendor]) acc[vendor] = [];
		acc[vendor].push(item);
		return acc;
	}, {});

	useEffect(() => {
		async function loadItems() {
			const fetchedItems = await fetchItems();
			setItems(fetchedItems);

			// Expand all groups initially
			const allVendors = {};
			fetchedItems.forEach((i) => {
				const vendor = i.vendor_name || 'Unknown Vendor';
				allVendors[vendor] = true;
			});
			setExpandedGroups(allVendors);
		}
		loadItems();
	}, []);

	const toggleSelect = (id) => {
		setItems((prev) =>
			prev.map((item) =>
				item.item_id === id ? { ...item, selected: !item.selected } : item
			)
		);
	};

	const toggleSelectAll = (checked) => {
		setItems((prev) => prev.map((item) => ({ ...item, selected: checked })));
	};

	const toggleSelectGroup = (vendorName, checked) => {
		setItems((prev) =>
			prev.map((item) =>
				(item.vendor_name || 'Unknown Vendor') === vendorName
					? { ...item, selected: checked }
					: item
			)
		);
	};

	const toggleGroupCollapse = (vendor) => {
		setExpandedGroups((prev) => ({
			...prev,
			[vendor]: !prev[vendor],
		}));
	};

	const allChecked = items.length > 0 && items.every((i) => i.selected);

	useEffect(() => {
		const checkbox = document.getElementById('select-all');
		if (checkbox) {
			checkbox.indeterminate =
				items.some((i) => i.selected) && !items.every((i) => i.selected);
		}
		// Set indeterminate for each group
		Object.entries(groupedItems).forEach(([vendor, items]) => {
			const input = document.getElementById(`group-checkbox-${vendor}`);
			if (input) {
				const someSelected = items.some((i) => i.selected);
				const allSelected = items.every((i) => i.selected);
				input.indeterminate = someSelected && !allSelected;
			}
		});
	}, [items]);

	const selectedItems = items.filter((i) => i.selected);

	const handleLogout = () => logout();

	const handleCreatePO = () => {
		alert(`${selectedItems.length} item(s) selected for Purchase Order`);
	};

	const handleClearSelection = () => {
		setItems((prev) => prev.map((item) => ({ ...item, selected: false })));
	};

	useEffect(() => {
		const handleKeyDown = (e) => {
			if (e.key === 'Escape') handleClearSelection();
		};
		window.addEventListener('keydown', handleKeyDown);
		return () => window.removeEventListener('keydown', handleKeyDown);
	}, []);

	return (
		<div className="relative bg-white rounded shadow border border-gray-200 overflow-x-auto">
			{selectedItems.length > 0 && (
				<div className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-gray-300 shadow px-4 py-2 text-sm flex items-center justify-between">
					<div className="flex-shrink-0">
						{selectedItems.length >= 1 && (
							<button
								onClick={handleCreatePO}
								className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded text-sm font-medium">
								Create Purchase Order
							</button>
						)}
					</div>

					<div className="absolute left-1/2 transform -translate-x-1/2 text-gray-700 font-medium text-sm">
						{selectedItems.length} Selected
					</div>

					<div className="flex-shrink-0">
						<button
							onClick={handleClearSelection}
							className="text-gray-400 hover:text-gray-600 text-lg leading-none">
							&#x2715; <span className="text-sm ml-1">Esc</span>
						</button>
					</div>
				</div>
			)}

			<div className="p-4">
				<div className="flex justify-between items-center mb-4">
					<h1 className="text-xl font-semibold text-gray-800">
						Low Stock Items
					</h1>
					<button
						onClick={handleLogout}
						className="bg-red-500 hover:underline text-white px-4 py-2 rounded text-sm font-medium">
						Logout
					</button>
				</div>

				<table className="min-w-full table-fixed border-collapse text-sm text-gray-700">
					<thead className="bg-gray-50">
						<tr>
							<th className="p-2 w-[40px] text-center">
								<input
									id="select-all"
									type="checkbox"
									checked={allChecked}
									onChange={(e) => toggleSelectAll(e.target.checked)}
									className="form-checkbox h-4 w-4 text-blue-600"
									aria-label="Select All"
								/>
							</th>
							<th className="p-2 text-left w-[200px]">Item Name</th>
							<th className="p-2 text-left w-[120px]">SKU</th>
							<th className="p-2 text-right w-[100px]">Rate</th>
							<th className="p-2 text-left w-[80px]">Unit</th>
							<th className="p-2 text-left w-[100px]">HSN/SAC</th>
							<th className="p-2 text-right w-[120px]">Max Capacity</th>
							<th className="p-2 text-right w-[120px]">Stock on Hand</th>
							<th className="p-2 text-right w-[140px]">Raw Qty Order</th>
						</tr>
					</thead>

					<tbody className="divide-y divide-gray-100">
						{Object.entries(groupedItems).map(([vendor, vendorItems]) => {
							const isExpanded = expandedGroups[vendor] ?? true;
							const allGroupSelected = vendorItems.every((i) => i.selected);

							return (
								<React.Fragment key={vendor}>
									<tr>
										<td className="p-2 bg-gray-100 w-[40px] text-center">
											<input
												id={`group-checkbox-${vendor}`}
												type="checkbox"
												checked={allGroupSelected}
												onChange={(e) =>
													toggleSelectGroup(vendor, e.target.checked)
												}
												onClick={(e) => e.stopPropagation()}
												className="form-checkbox h-4 w-4 text-blue-600"
											/>
										</td>
										<td
											colSpan={8}
											className="p-2 bg-gray-100 text-left cursor-pointer select-none"
											onClick={() => toggleGroupCollapse(vendor)}>
											<div className="flex items-center gap-2 font-medium text-gray-800">
												<span className="text-lg">
													{isExpanded ? '▼' : '▶'}
												</span>
												<span>{vendor}</span>
											</div>
										</td>
									</tr>
									{isExpanded &&
										vendorItems.map((item) => (
											<ItemRow
												key={item.item_id}
												item={item}
												toggleSelect={toggleSelect}
											/>
										))}
								</React.Fragment>
							);
						})}
					</tbody>
				</table>
			</div>
		</div>
	);
}
