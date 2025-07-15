export default function ItemRow({ item, toggleSelect }) {
	// Convert fields to numbers safely
	const maxCapacity = Number(item.cf_maximum_capacity);
	const stockOnHand = Number(item.stock_on_hand);
	const rawQtyOrder =
		!isNaN(maxCapacity) && !isNaN(stockOnHand) ? maxCapacity - stockOnHand : '';

	const highlightRawQty = typeof rawQtyOrder === 'number' && rawQtyOrder > 0;

	return (
		<tr
			key={item.item_id}
			className={`cursor-pointer hover:bg-gray-100 ${
				item.selected ? 'bg-blue-50' : ''
			}`}>
			<td className="p-2 text-center w-[40px]">
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
				className="p-2 text-left text-blue-600 underline w-[200px]"
				onClick={() =>
					window.open(
						`https://books.zoho.com/app#/items/${item.item_id}`,
						'_blank'
					)
				}>
				{item.name}
			</td>

			<td className="p-2 text-left w-[120px]">{item.sku}</td>

			<td className="p-2 text-right w-[100px]">
				{item.currency_code} {item.rate.toFixed(2)}
			</td>

			<td className="p-2 text-left w-[80px]">{item.unit}</td>

			<td className="p-2 text-left w-[100px]">{item.hsn_or_sac}</td>

			<td className="p-2 text-right w-[120px]">{maxCapacity}</td>

			<td className="p-2 text-right w-[120px]">{stockOnHand}</td>

			<td
				className={`p-2 text-right w-[140px] ${
					highlightRawQty ? 'text-red-600 font-semibold' : 'text-gray-600'
				}`}>
				{typeof rawQtyOrder === 'number' ? rawQtyOrder : ''}
			</td>
		</tr>
	);
}
