// Square tick box from the design canvas: 18px, 4px radius, brand fill when on.
// `indeterminate` is the part-selected state used by the select-all and the
// group headers — a dash rather than a tick.
export default function Checkbox({
	checked,
	indeterminate,
	onChange,
	disabled,
	size = 18,
	label,
}) {
	const filled = checked || indeterminate;

	return (
		<div
			role="checkbox"
			aria-checked={indeterminate ? 'mixed' : !!checked}
			aria-label={label}
			tabIndex={disabled ? -1 : 0}
			onClick={(e) => {
				e.stopPropagation();
				if (!disabled) onChange?.();
			}}
			onKeyDown={(e) => {
				if (!disabled && (e.key === ' ' || e.key === 'Enter')) {
					e.preventDefault();
					e.stopPropagation();
					onChange?.();
				}
			}}
			style={{ width: size, height: size }}
			className={`rounded flex items-center justify-center flex-shrink-0 ${
				disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
			} ${
				filled
					? 'bg-brand border border-brand'
					: 'bg-surface border-[1.5px] border-muted-4'
			}`}>
			{checked ? (
				<svg
					width={size * 0.67}
					height={size * 0.67}
					viewBox="0 0 24 24"
					fill="none"
					stroke="#fff"
					strokeWidth="3">
					<path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
				</svg>
			) : indeterminate ? (
				<span
					className="bg-white rounded-full"
					style={{ width: size * 0.5, height: 2 }}
				/>
			) : null}
		</div>
	);
}

// Round tick used in the bulk-add modal's left pane.
export function RoundCheck({ checked, size = 22 }) {
	return (
		<div
			style={{ width: size, height: size }}
			className={`rounded-full flex items-center justify-center flex-shrink-0 ${
				checked
					? 'bg-ok border border-ok'
					: 'bg-surface border-[1.5px] border-line-2'
			}`}>
			{checked && (
				<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3">
					<path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
				</svg>
			)}
		</div>
	);
}
