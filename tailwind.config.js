/** @type {import('tailwindcss').Config} */
// Palette lifted from the Claude Design canvas (docs/design/LowStockItems.dc.html).
// Names describe role, not hue, so a future re-skin only touches this file.
module.exports = {
	content: ['./src/**/*.{js,jsx,ts,tsx}'],
	theme: {
		extend: {
			colors: {
				app: '#eef0f3', // page background
				surface: '#ffffff',
				'surface-2': '#f6f7f9', // table headers, group rows, segmented track
				'surface-3': '#fbfcfd', // metric cards
				'surface-4': '#f4f5f7', // PO overlay background
				sidebar: '#fafbfc',

				line: '#e6e8eb', // default border
				'line-2': '#d7dbe0', // input border
				'line-3': '#eceef1', // soft divider
				'line-4': '#f1f2f4', // softest divider

				heading: '#2a2f37',
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

				ok: '#1a9d54',
				warn: '#c77700',
				'warn-2': '#b06a00',
				'warn-bg': '#fdf2dc',
				'warn-border': '#f2d79a',
				danger: '#e0322b',
				'danger-border': '#f3d2d2',

				'row-selected': '#f4f9ff',
			},
			fontFamily: {
				sans: ['Lato', 'system-ui', 'sans-serif'],
			},
		},
	},
	plugins: [],
};
