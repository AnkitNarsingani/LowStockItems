import React, { useEffect, useState } from 'react';
import { fetchItems } from './ZohoAPI';
import ItemRow from './ItemRow';

export default function ZohoItemsTable() {
	const [items, setItems] = useState([]);
	const [allSelected, setAllSelected] = useState(false);

	useEffect(() => {
		async function loadItems() {
			const fetchedItems = await fetchItems();
			setItems(fetchedItems);
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
		setAllSelected(checked);
		setItems((prev) => prev.map((item) => ({ ...item, selected: checked })));
	};

	// Check if all selected
	const allChecked = items.length > 0 && items.every((i) => i.selected);

	return (
		<div className="p-4 overflow-x-auto bg-white rounded shadow">
			<div className="flex justify-between items-center mb-4">
				<h1 className="text-xl font-semibold text-gray-700">Low Stock Items</h1>
				<button
					onClick={() =>
						window.open(
							'https://books.laxmitrading.in/app/60013163918#/purchaseorders/new',
							'_blank'
						)
					}
					className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded">
					+ New
				</button>
			</div>
			<table className="min-w-full table-fixed border-collapse">
				<thead className="bg-gray-50">
					<tr>
						<th className="p-2">
							<input
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
						<th className="p-2 text-right">Stock on Hand</th>
					</tr>
				</thead>
				<tbody className="divide-y divide-gray-100">
					{items.map((item) => (
						<ItemRow
							key={item.item_id}
							item={item}
							toggleSelect={toggleSelect}
						/>
					))}
				</tbody>
			</table>
		</div>
	);
}
