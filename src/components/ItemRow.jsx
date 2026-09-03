import './ItemRow.css';
import Checkbox from './Checkbox';

// Shared so the header and the rows can never drift apart.
export const LOW_TABLE_COLS = '38px 2.4fr 1fr 1fr 1.2fr 1.2fr 1.3fr 0.9fr';

const money = (v) =>
	'₹' +
	Number(v || 0).toLocaleString('en-IN', {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	});

const dec2 = (v) => (v == null || v === '' ? '—' : Number(v).toFixed(2));

export default function ItemRow({ item, selected, toggleSelect }) {
	const stock = Number(item.stock_on_hand);
	const reorder = item.reorder_level;

	// Design's stockColorFor: red at or below zero, amber at or below the
	// reorder point, green otherwise.
	const stockColor =
		stock <= 0
			? 'text-danger'
			: reorder != null && stock <= Number(reorder)
				? 'text-warn'
				: 'text-ok';

	return (
		<div
			className={`item-row grid px-[18px] py-[13px] border-b border-line-4 text-[13.5px] items-center ${
				selected ? 'bg-row-selected' : 'bg-surface'
			}`}
			style={{ gridTemplateColumns: LOW_TABLE_COLS }}>
			<div>
				<Checkbox
					checked={selected}
					onChange={() => toggleSelect?.(item.item_id)}
				/>
			</div>

			<div className="min-w-0">
				<span
					onClick={() =>
						window.open(
							`https://books.zoho.com/app#/items/${item.item_id}`,
							'_blank',
						)
					}
					className="text-link font-bold cursor-pointer hover:underline break-words">
					{item.name}
				</span>
			</div>

			<div className="num text-body-3 truncate">{item.sku || '—'}</div>

			<div className="num text-right pr-2.5 text-body">{money(item.rate)}</div>

			<div className={`num text-right pr-2.5 font-bold ${stockColor}`}>
				{dec2(item.stock_on_hand)}
			</div>

			<div className="num text-right pr-2.5 text-body-3">{dec2(reorder)}</div>

			<div className="num text-right pr-2.5 text-body-3">
				{dec2(item.cf_maximum_capacity)}
			</div>

			<div className="text-muted truncate">{item.unit || 'box'}</div>
		</div>
	);
}
