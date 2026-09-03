import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { listLostSales, deleteLostSale } from '../lib/lostSales';
import Pagination from '../components/Pagination';

const COLS = '110px minmax(0,1.4fr) minmax(0,1.6fr) 110px minmax(0,1.4fr) 80px';

const fmtDate = (d) => {
	if (!d) return '—';
	const parsed = new Date(`${d}T00:00:00`);
	if (Number.isNaN(parsed.getTime())) return d;
	return parsed.toLocaleDateString('en-IN', {
		day: '2-digit',
		month: 'short',
		year: 'numeric',
	});
};

export default function LostSalesListPage() {
	const navigate = useNavigate();
	const location = useLocation();

	const [records, setRecords] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);
	const [banner, setBanner] = useState(null);
	const [search, setSearch] = useState('');
	const [deletingId, setDeletingId] = useState(null);
	const [page, setPage] = useState(0);
	const [pageSize, setPageSize] = useState(50);

	// The form hands its confirmation over through router state.
	useEffect(() => {
		const handed = location.state?.lostSaleResult;
		if (!handed) return;
		setBanner(handed);
		navigate(location.pathname, { replace: true, state: null });
	}, [location.state, location.pathname, navigate]);

	const load = useCallback(() => {
		setLoading(true);
		setError(null);
		listLostSales()
			.then(setRecords)
			.catch((e) => setError(e.message || 'Could not load lost sales.'))
			.finally(() => setLoading(false));
	}, []);

	useEffect(load, [load]);

	const filtered = useMemo(() => {
		const q = search.toLowerCase().trim();
		if (!q) return records;
		return records.filter(
			(r) =>
				(r.customer_name || '').toLowerCase().includes(q) ||
				(r.item_name || '').toLowerCase().includes(q) ||
				(r.note || '').toLowerCase().includes(q),
		);
	}, [records, search]);

	// A new search invalidates the current page number.
	useEffect(() => setPage(0), [search]);

	const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
	const safePage = Math.min(page, pageCount - 1);
	const visible = useMemo(
		() => filtered.slice(safePage * pageSize, safePage * pageSize + pageSize),
		[filtered, safePage, pageSize],
	);

	const totalQty = useMemo(
		() => filtered.reduce((s, r) => s + (Number(r.qty_wanted) || 0), 0),
		[filtered],
	);

	const handleDelete = async (rec) => {
		setDeletingId(rec.id);
		try {
			await deleteLostSale({ id: rec.id, date: rec.date });
			setRecords((prev) => prev.filter((r) => r.id !== rec.id));
		} catch (e) {
			setError(e.message || 'Could not delete that record.');
		} finally {
			setDeletingId(null);
		}
	};

	return (
		<div className="px-7 pt-[22px] pb-[70px]">
			{/* Title row */}
			<div className="flex items-center gap-3 mb-1 flex-wrap">
				<div className="text-[20px] font-bold text-heading">Lost sales</div>
				<div className="flex-1" />
				<button
					onClick={() => navigate('/lost-sales/new')}
					className="h-9 px-[15px] rounded border border-brand bg-brand text-white font-bold text-[13px] cursor-pointer flex items-center gap-1.5">
					<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4">
						<path d="M12 5v14M5 12h14" strokeLinecap="round" />
					</svg>
					Record lost sale
				</button>
			</div>

			{/* Toolbar */}
			<div className="flex items-center gap-2.5 mb-3.5 flex-wrap">
				<div className="flex items-center gap-2 border border-line-2 rounded bg-surface px-[11px] h-9 w-60 max-w-full">
					<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#a7adb5" strokeWidth="2" className="flex-shrink-0">
						<circle cx="11" cy="11" r="7" />
						<path d="M21 21l-4-4" strokeLinecap="round" />
					</svg>
					<input
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						placeholder="Search customer, item or note…"
						className="border-none outline-none text-[13px] w-full bg-transparent"
					/>
				</div>
				<div className="flex-1" />
				<span className="text-[12.5px] text-muted num">
					{filtered.length.toLocaleString('en-IN')} record
					{filtered.length !== 1 ? 's' : ''} · {totalQty.toLocaleString('en-IN')}{' '}
					units
				</span>
			</div>

			{banner && (
				<div className="flex items-center justify-between gap-3 px-4 py-2.5 mb-3.5 rounded border bg-green-50 border-green-200 text-ok text-[13px]">
					<span className="flex items-center gap-2 min-w-0">
						<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" className="flex-shrink-0">
							<path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
						</svg>
						<span className="truncate">{banner.message}</span>
					</span>
					<button
						onClick={() => setBanner(null)}
						aria-label="Dismiss"
						className="opacity-60 hover:opacity-100 bg-transparent border-none cursor-pointer text-current">
						✕
					</button>
				</div>
			)}

			{error && (
				<div className="px-4 py-2.5 mb-3.5 rounded border bg-red-50 border-danger-border text-danger text-[13px]">
					{error}
				</div>
			)}

			{/* Table */}
			<div className="bg-surface border border-line rounded overflow-hidden">
				<div
					className="grid px-[18px] py-3 bg-surface-2 border-b border-line text-[10.5px] font-bold text-muted tracking-[.04em] items-center"
					style={{ gridTemplateColumns: COLS }}>
					<div>DATE</div>
					<div>CUSTOMER</div>
					<div>ITEM</div>
					<div className="text-right pr-2.5">QTY WANTED</div>
					<div>NOTE</div>
					<div className="text-right">ACTIONS</div>
				</div>

				{loading ? (
					<div className="px-[18px] py-3">
						{[70, 82, 60].map((w, i) => (
							<div
								key={i}
								className="h-3 rounded bg-line-4 animate-pulse my-3"
								style={{ width: `${w}%` }}
							/>
						))}
					</div>
				) : filtered.length === 0 ? (
					<div className="p-10 text-center text-muted-2 text-[13px]">
						{records.length === 0
							? 'No lost sales recorded yet.'
							: 'No records match your search.'}
					</div>
				) : (
					visible.map((r) => (
						<div
							key={r.id}
							className="grid px-[18px] py-[13px] border-b border-line-4 text-[13.5px] items-center hover:bg-surface-2"
							style={{ gridTemplateColumns: COLS }}>
							<div className="num text-body-3">{fmtDate(r.date)}</div>
							<div className="text-body truncate">
								{r.customer_name || '—'}
							</div>
							<div className="min-w-0">
								<span className="text-body truncate">{r.item_name || '—'}</span>
								{r.is_free_text && (
									<span className="ml-1.5 text-[10px] font-bold text-warn-2 bg-warn-bg border border-warn-border rounded-[20px] px-1.5 py-px">
										new
									</span>
								)}
							</div>
							<div className="num text-right pr-2.5 font-bold text-body">
								{r.qty_wanted}
							</div>
							<div className="text-muted-2 truncate" title={r.note || ''}>
								{r.note || '—'}
							</div>
							<div className="flex justify-end">
								<button
									onClick={() => handleDelete(r)}
									disabled={deletingId === r.id}
									title="Delete this record"
									className="w-6 h-6 rounded-full border border-danger-border bg-surface flex items-center justify-center cursor-pointer text-danger hover:bg-red-50 disabled:opacity-40">
									<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
										<path d="M6 6l12 12M18 6L6 18" />
									</svg>
								</button>
							</div>
						</div>
					))
				)}
			</div>

			{!loading && filtered.length > 0 && (
				<div className="mt-3.5">
					<Pagination
						total={filtered.length}
						page={safePage}
						pageSize={pageSize}
						onPageChange={setPage}
						onPageSizeChange={setPageSize}
					/>
				</div>
			)}
		</div>
	);
}
