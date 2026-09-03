// Zoho's form rhythm: a fixed label column on the left, a narrow control column
// beside it, and a red asterisk on anything required. Shared by the New PO page
// and the lost-sale form so the two read as one product.
export default function Field({
	label,
	children,
	align = 'center',
	required,
	hint,
	error,
}) {
	return (
		<div
			className="grid gap-6"
			style={{
				gridTemplateColumns: '180px minmax(0,420px)',
				alignItems: align === 'start' ? 'start' : 'center',
			}}>
			<label
				className={`text-[13.5px] text-body ${align === 'start' ? 'pt-2' : ''}`}>
				{label}
				{required && <span className="text-danger ml-0.5">*</span>}
			</label>
			<div className="min-w-0">
				{children}
				{/* Validation reads inline under the field — never an alert box. */}
				{error ? (
					<div className="text-[11.5px] text-danger mt-1.5">{error}</div>
				) : hint ? (
					<div className="text-[11px] text-muted mt-1.5">{hint}</div>
				) : null}
			</div>
		</div>
	);
}
