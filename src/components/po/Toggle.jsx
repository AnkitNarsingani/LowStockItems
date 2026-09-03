// 36x20 pill switch from the design canvas.
export default function Toggle({ on, onChange, disabled }) {
	return (
		<button
			type="button"
			role="switch"
			aria-checked={!!on}
			disabled={disabled}
			onClick={onChange}
			className={`w-9 h-5 rounded-[20px] relative transition-colors flex-shrink-0 border-none p-0 ${
				disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
			} ${on ? 'bg-brand' : 'bg-muted-4'}`}>
			<span
				className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all"
				style={{ left: on ? 18 : 2 }}
			/>
		</button>
	);
}
