/** @type {import('tailwindcss').Config} */
// Palette lifted from the Claude Design canvas (docs/design/LowStockItems.dc.html).
// Names describe role, not hue, so a future re-skin only touches this file.
module.exports = {
	content: ['./src/**/*.{js,jsx,ts,tsx}'],
	theme: {
		extend: {
			colors: {
				app: '#eef1f5', // page background
				surface: '#ffffff',
				'surface-2': '#f6f7f9', // table headers, group rows, segmented track
				'surface-3': '#fbfcfd', // metric cards
				'surface-4': '#f4f5f7', // PO overlay background
				sidebar: '#fafbfc',

				line: '#e6e8eb', // default border
				'line-2': '#d7dbe0', // input border
				'line-3': '#eceef1', // soft divider
				'line-4': '#f1f2f4', // softest divider

				heading: '#232830',
				body: '#333a45',
				'body-2': '#4a5057',
				'body-3': '#5b6270',
				muted: '#8b919a',
				'muted-2': '#9aa0a8',
				'muted-3': '#a7adb5', // placeholder
				'muted-4': '#cfd4da', // unchecked control border

				brand: '#408dfb', // primary buttons, active nav, checkbox fill
				link: '#2f7be0',
				'link-hover': '#1f6ad0',
				'brand-bg': '#eaf2ff',
				'brand-border': '#cfe0fb',

				// A full ramp behind the single brand blue. Gradients, glows and
				// tinted washes all need neighbours of the brand hue, and mixing
				// them inline is how a palette drifts.
				'brand-50': '#f2f7ff',
				'brand-100': '#e2edff',
				'brand-200': '#c7dcfe',
				'brand-300': '#9cc3fd',
				'brand-400': '#6ba6fc',
				'brand-500': '#408dfb',
				'brand-600': '#2f7be0',
				'brand-700': '#2263bb',
				'brand-800': '#1b4e94',
				'brand-900': '#173f76',

				ok: '#1a9d54',
				'ok-bg': '#e9f7ef',
				'ok-border': '#bfe5cf',
				warn: '#c77700',
				'warn-2': '#b06a00',
				'warn-bg': '#fdf2dc',
				'warn-border': '#f2d79a',
				danger: '#e0322b',
				'danger-bg': '#fdeceb',
				'danger-border': '#f3d2d2',

				'row-selected': '#f4f9ff',
			},
			fontFamily: {
				sans: ['Lato', 'system-ui', 'sans-serif'],
			},
			// Shadows are tinted with the page's blue-grey rather than pure black,
			// so a lifted surface reads as sitting on this background and not as a
			// grey haze over it.
			boxShadow: {
				card: '0 1px 2px rgba(28,42,70,.04), 0 1px 3px rgba(28,42,70,.06)',
				'card-hover':
					'0 2px 4px rgba(28,42,70,.05), 0 8px 20px rgba(28,42,70,.09)',
				pop: '0 4px 10px rgba(28,42,70,.08), 0 14px 34px rgba(28,42,70,.14)',
				float: '0 10px 20px rgba(28,42,70,.10), 0 24px 60px rgba(28,42,70,.18)',
				'inner-line': 'inset 0 -1px 0 #eceef1',
			},
			transitionTimingFunction: {
				// One easing curve for everything that moves: a gentle overshoot-free
				// ease-out that reads as responsive rather than floaty.
				smooth: 'cubic-bezier(.22,.61,.36,1)',
				spring: 'cubic-bezier(.34,1.56,.64,1)',
			},
			keyframes: {
				'fade-up': {
					from: { opacity: '0', transform: 'translateY(6px)' },
					to: { opacity: '1', transform: 'translateY(0)' },
				},
				'fade-in': {
					from: { opacity: '0' },
					to: { opacity: '1' },
				},
				'pop-in': {
					'0%': { opacity: '0', transform: 'scale(.94)' },
					'100%': { opacity: '1', transform: 'scale(1)' },
				},
				'slide-down': {
					from: { opacity: '0', transform: 'translateY(-6px) scale(.98)' },
					to: { opacity: '1', transform: 'translateY(0) scale(1)' },
				},
				'slide-up-in': {
					from: { opacity: '0', transform: 'translateY(14px)' },
					to: { opacity: '1', transform: 'translateY(0)' },
				},
				shimmer: {
					'100%': { transform: 'translateX(100%)' },
				},
				// A ring that expands and fades — used behind live activity dots.
				halo: {
					'0%': { transform: 'scale(.7)', opacity: '.55' },
					'70%,100%': { transform: 'scale(2.2)', opacity: '0' },
				},
				'bar-grow': {
					from: { transform: 'scaleX(0)' },
					to: { transform: 'scaleX(1)' },
				},
				'tick-draw': {
					from: { strokeDashoffset: '24' },
					to: { strokeDashoffset: '0' },
				},
			},
			animation: {
				'fade-up': 'fade-up .28s cubic-bezier(.22,.61,.36,1) both',
				'fade-in': 'fade-in .2s ease both',
				'pop-in': 'pop-in .18s cubic-bezier(.34,1.56,.64,1) both',
				'slide-down': 'slide-down .16s cubic-bezier(.22,.61,.36,1) both',
				'slide-up-in': 'slide-up-in .26s cubic-bezier(.22,.61,.36,1) both',
				shimmer: 'shimmer 1.6s infinite',
				halo: 'halo 1.8s cubic-bezier(0,0,.2,1) infinite',
				'bar-grow': 'bar-grow .5s cubic-bezier(.22,.61,.36,1) both',
				'tick-draw': 'tick-draw .3s cubic-bezier(.22,.61,.36,1) .05s both',
			},
		},
	},
	plugins: [],
};
