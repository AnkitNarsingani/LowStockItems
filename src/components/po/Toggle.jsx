// 36x20 pill switch from the design canvas.
export default function Toggle({ on, onChange, disabled }) {
	return (
		<button
			type="button"
			role="switch"
			aria-checked={!!on}
			disabled={disabled}
			onClick={onChange}
			className={`w-9 h-5 rounded-[20px] relative flex-shrink-0 border-none p-0 transition-colors duration-200 ease-smooth ${
				disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
			} ${
				on
					? 'bg-brand shadow-[0_1px_3px_rgba(64,141,251,.45)]'
					: 'bg-muted-4 hover:bg-muted-3'
			}`}>
			{/* The knob travels on a spring curve — it lands with a hint of settle,
			    which is what makes a switch feel switched rather than repainted. */}
			<span
				className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-[0_1px_2px_rgba(28,42,70,.3)] transition-[left] duration-200 ease-spring"
				style={{ left: on ? 18 : 2 }}
			/>
		</button>
	);
}
