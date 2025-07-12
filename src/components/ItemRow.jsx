import React from 'react';

export default function ItemRow({ item, toggleSelect }) {
	return (
		<tr
			key={item.item_id}
			className={`cursor-pointer hover:bg-gray-100 ${
				item.selected ? 'bg-blue-50' : ''
			}`}>
			<td className="p-2 text-center">
				<input
					type="checkbox"
					checked={item.selected}
					onChange={() => toggleSelect(item.item_id)}
					className="form-checkbox h-4 w-4 text-blue-600"
					aria-label={`Select ${item.name}`}
					onClick={(e) => e.stopPropagation()}
				/>
			</td>
			<td
				className="p-2 text-left text-blue-600 underline"
				onClick={() =>
					window.open(
						`https://books.zoho.com/app#/items/${item.item_id}`,
						'_blank'
					)
				}>
				{item.name}
			</td>
			<td className="p-2 text-left">{item.sku}</td>
			<td className="p-2 text-right">
				{item.currency_code} {item.rate.toFixed(2)}
			</td>
			<td className="p-2 text-left">{item.unit}</td>
			<td className="p-2 text-left">{item.hsn_or_sac}</td>
			<td className="p-2 text-right">{item.stock_on_hand}</td>
		</tr>
	);
}
