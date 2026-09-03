import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { logout } from '../App';

// 52px top bar + 236px sidebar, per docs/design/LowStockItems.dc.html.
export const TOP_BAR_H = 52;
export const SIDEBAR_W = 236;

const NAV = [
	{
		to: '/',
		label: 'Low stock items',
		// The New PO page is a child of this section, so the item stays lit there.
		matches: (p) => p === '/' || p.startsWith('/po'),
		icon: (
			<>
				<path d="M3 7l9-4 9 4-9 4-9-4z" />
				<path d="M3 7v10l9 4 9-4V7" />
				<path d="M12 11v10" />
			</>
		),
	},
	{
		to: '/lost-sales',
		label: 'Lost sales',
		matches: (p) => p.startsWith('/lost-sales'),
		icon: (
			<>
				<path d="M4 4h12l4 4v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" />
				<path d="M8 13h8" />
			</>
		),
	},
	{
		to: '/reorder-suggestions',
		label: 'Reorder suggestions',
		matches: (p) => p.startsWith('/reorder-suggestions'),
		icon: (
			<>
				<path d="M4 6h11" />
				<circle cx="18" cy="6" r="2" />
				<path d="M4 12h5" />
				<circle cx="12" cy="12" r="2" />
				<path d="M4 18h11" />
				<circle cx="18" cy="18" r="2" />
			</>
		),
	},
];

export default function AppShell() {
	const { pathname } = useLocation();

	return (
		<div className="min-h-screen bg-app flex flex-col text-left">
			{/* TOP BAR */}
			<div className="h-[52px] bg-surface border-b border-line flex items-center px-5 gap-[11px] sticky top-0 z-40 flex-shrink-0">
				<div className="w-[26px] h-[26px] rounded-[7px] bg-brand flex items-center justify-center text-white font-black text-[14px]">
					L
				</div>
				<div className="font-bold text-[15px] text-body">LowStockItems</div>

				<div className="flex-1" />

				<button
					onClick={logout}
					className="flex items-center gap-2 h-8 px-3 rounded-lg border border-line-2 bg-surface text-body-2 font-bold text-[12.5px] cursor-pointer hover:bg-surface-2">
					<svg
						width="15"
						height="15"
						viewBox="0 0 24 24"
						fill="none"
						stroke="#5b6270"
						strokeWidth="1.9"
						strokeLinecap="round"
						strokeLinejoin="round">
						<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
						<path d="M16 17l5-5-5-5" />
						<path d="M21 12H9" />
					</svg>
					Log out
				</button>
			</div>

			<div className="flex-1 flex items-start min-h-0">
				{/* SIDEBAR */}
				<nav className="w-[236px] flex-shrink-0 bg-sidebar border-r border-line p-4 px-3 flex flex-col gap-0.5 sticky top-[52px] h-[calc(100vh-52px)] overflow-y-auto self-start">
					<div className="text-[10px] font-bold text-muted-3 tracking-[.06em] px-3 pt-1 pb-2">
						WORKSPACE
					</div>

					{NAV.map((item) => {
						const active = item.matches(pathname);
						return (
							<NavLink
								key={item.to}
								to={item.to}
								className={`flex items-center gap-[11px] w-full text-left rounded-lg px-3 py-[9px] text-[13.5px] font-bold no-underline hover:no-underline ${
									active
										? 'bg-brand text-white'
										: 'bg-transparent text-body-2 hover:bg-line-4'
								}`}>
								<svg
									width="18"
									height="18"
									viewBox="0 0 24 24"
									fill="none"
									stroke={active ? '#fff' : '#7a828c'}
									strokeWidth="1.9"
									strokeLinecap="round"
									strokeLinejoin="round">
									{item.icon}
								</svg>
								<span>{item.label}</span>
							</NavLink>
						);
					})}
				</nav>

				{/* MAIN */}
				<main className="flex-1 min-w-0 overflow-x-auto">
					<Outlet />
				</main>
			</div>
		</div>
	);
}
