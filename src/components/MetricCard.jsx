// The figure that sits above a list, as the design canvas draws it.
//
// Shared rather than copied: the low-stock and lost-sale lists both open with
// a row of these, and a second copy would be the first thing to drift.
export default function MetricCard({ label, value, accent }) {
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
