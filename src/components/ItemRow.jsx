import './ItemRow.css';

export default function ItemRow({ item, toggleSelect }) {
	const maxCapacity = Number(item.cf_maximum_capacity);
	const stockOnHand = Number(item.stock_on_hand);
	const rawQtyOrder =
		!isNaN(maxCapacity) && !isNaN(stockOnHand)
			? maxCapacity - stockOnHand
			: null;

	// Status: critical = zero/negative, warning = low but positive, ok = fine
	const status =
		stockOnHand < 0 || stockOnHand === 0
			? 'critical'
			: !isNaN(maxCapacity) && stockOnHand < maxCapacity * 0.3
				? 'warning'
				: 'ok';

	const stockClass =
		status === 'critical'
			? 'text-red-500 font-medium'
			: status === 'warning'
				? 'text-amber-600 font-medium'
				: 'text-gray-500';

	const toOrderContent =
		rawQtyOrder === null ? null : rawQtyOrder === 0 ? (
			<span className="inline-block px-1.5 py-0.5 rounded bg-gray-100 text-gray-400 font-medium">
				0
			</span>
		) : (
			<span
				className={
					status === 'critical'
						? 'inline-block px-1.5 py-0.5 rounded bg-red-50 text-red-500 font-medium'
						: 'inline-block px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 font-medium'
				}>
				{rawQtyOrder}
			</span>
		);

	return (
		<tr
			className={`item-row border-b border-gray-50 cursor-pointer transition-colors duration-75 ${
				item.selected ? 'bg-blue-50' : 'hover:bg-gray-50'
			}`}>
			{/* Checkbox */}
			<td className="p-2 text-center w-9">
				<input
					type="checkbox"
					checked={!!item.selected}
					onChange={() => toggleSelect?.(item.item_id)}
					className="form-checkbox h-3.5 w-3.5 text-blue-500 rounded"
					aria-label={`Select ${item.name}`}
					onClick={(e) => e.stopPropagation()}
				/>
			</td>

			{/* Item name */}
			<td
				className="p-2 text-left w-48"
				onClick={() =>
					window.open(
						`https://books.zoho.com/app#/items/${item.item_id}`,
						'_blank',
					)
				}>
				<span className="text-blue-600 hover:underline text-xs cursor-pointer">
					{item.name}
				</span>
			</td>

			{/* SKU */}
			<td className="p-2 text-left w-28">
				<span className="font-mono text-xs text-gray-500">{item.sku}</span>
			</td>

			{/* Rate */}
			<td className="p-2 text-right w-24 tabular-nums text-xs text-gray-700">
				{item.currency_code}
				{'₹'}
				{typeof item.rate === 'number'
					? item.rate.toLocaleString('en-IN', {
							minimumFractionDigits: 2,
							maximumFractionDigits: 2,
						})
					: item.rate}
			</td>

			{/* Unit */}
			<td className="p-2 text-left w-16">
				<span className="text-xs bg-gray-100 border border-gray-200 rounded px-1.5 py-0.5 text-gray-500">
					{item.unit}
				</span>
			</td>

			{/* HSN / SAC */}
			<td className="p-2 text-left w-24">
				<span className="font-mono text-xs text-gray-400">
					{item.hsn_or_sac}
				</span>
			</td>

			{/* Max capacity */}
			<td className="p-2 text-right w-24 text-xs text-gray-500 tabular-nums">
				{isNaN(maxCapacity) ? '—' : maxCapacity}
			</td>

			{/* On hand */}
			<td className="p-2 text-right w-24 tabular-nums">
				<span className={`text-xs ${stockClass}`}>{stockOnHand}</span>
			</td>

			{/* To order */}
			<td className="p-2 text-right w-28 tabular-nums">{toOrderContent}</td>
		</tr>
	);
}
