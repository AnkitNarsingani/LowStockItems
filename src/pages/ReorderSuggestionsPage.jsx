import { useState, useMemo, useRef, useCallback, useSyncExternalStore } from 'react';
import { subLineFor } from '../lib/reorderEngine';
import {
	subscribe as subscribeToRun,
	getState as getRunState,
	startRun,
	setDecision,
	setDecisions,
} from '../lib/reorderRun';
import UndoToast from '../components/UndoToast';

const COLS = 'minmax(0,2.4fr) minmax(0,1.6fr) minmax(0,1.6fr) 130px';
const UNDO_WINDOW = 5000;

/**
 * Reorder-point suggestion review — Engine B.
 *
 * Suggestions are computed on demand rather than on load: each item costs one
 * sales-report call, so running over a large catalogue is a deliberate act.
 *
 * A decision takes the row off the list and raises a countdown toast; until
 * the timer runs out it can be taken back. Nothing is written to Zoho — see
 * the note at the foot of the page.
 */
export default function ReorderSuggestionsPage() {
	// The run lives outside React so it survives navigating away — see
	// src/lib/reorderRun.js. The page is only a view onto it.
	const run = useSyncExternalStore(subscribeToRun, getRunState);
	const { suggestions, status, progress, error, scanned } = run;
	const busy = run.phase === 'running';

	// Toasts are ephemeral UI and stay local: leaving the page commits whatever
	// undo window was open, which is the right outcome.
	const [toasts, setToasts] = useState([]);
	const toastSeq = useRef(0);

	const dismiss = useCallback((tid) => {
		setToasts((list) => list.filter((t) => t.tid !== tid));
	}, []);

	const undo = useCallback(
		(toast) => {
			setDecisions(toast.previous);
			dismiss(toast.tid);
		},
		[dismiss],
	);

	const pushToast = (previous, label) => {
		const tid = ++toastSeq.current;
		setToasts((list) => [...list, { tid, previous, label }]);
	};

	const compute = () => {
		setToasts([]);
		startRun();
	};

	const decide = (suggestion, next) => {
		const previous = { [suggestion.item_id]: status[suggestion.item_id] };
		setDecision(suggestion.item_id, next);
		pushToast(
			previous,
			`${next === 'approved' ? 'Approving' : 'Rejecting'} ${suggestion.item_name}`,
		);
	};

	const approveAll = () => {
		const targets = (suggestions || []).filter(
			(s) => status[s.item_id] === 'pending',
		);
		if (targets.length === 0) return;

		setDecisions(
			Object.fromEntries(targets.map((s) => [s.item_id, 'approved'])),
		);
		for (const s of targets) {
			pushToast({ [s.item_id]: 'pending' }, `Approving ${s.item_name}`);
		}
	};

	const visible = useMemo(
		() => (suggestions || []).filter((s) => status[s.item_id] === 'pending'),
		[suggestions, status],
	);

	const counts = useMemo(() => {
		let approved = 0;
		let pending = 0;
		let rejected = 0;
		for (const st of Object.values(status)) {
			if (st === 'approved') approved++;
			else if (st === 'rejected') rejected++;
			else pending++;
		}
		return { approved, pending, rejected };
	}, [status]);

	return (
		<div className="px-7 pt-[22px] pb-20">
			{/* Title row */}
			<div className="flex items-center gap-3.5 mb-4 flex-wrap">
				<div className="text-[20px] font-bold text-heading">
					Reorder point suggestions
				</div>
				<div className="flex-1" />

				{suggestions && (
					<button
						onClick={compute}
						disabled={busy}
						className="h-9 px-[13px] rounded border border-line-2 bg-surface text-body-3 font-bold text-[12.5px] cursor-pointer disabled:opacity-50">
						Recompute
					</button>
				)}
				<button
					onClick={suggestions ? approveAll : compute}
					disabled={busy || (suggestions && counts.pending === 0)}
					className="h-9 px-[18px] rounded border border-brand bg-brand text-white font-bold text-[13px] cursor-pointer shadow-[0_1px_2px_rgba(64,141,251,.35)] disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2">
					{busy && (
						<span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
					)}
					{busy
						? 'Computing…'
						: suggestions
							? 'Approve all'
							: 'Compute suggestions'}
				</button>
			</div>

			{progress && (
				<div className="mb-4 max-w-[760px]">
					<div className="flex justify-between items-center mb-1.5">
						<span className="text-[12.5px] text-muted">
							Reading 365-day sales for each item. This keeps running if you
							go elsewhere.
						</span>
						<span className="text-[12.5px] font-bold text-body-3 num">
							{progress.done} / {progress.total}
						</span>
					</div>
					<div className="relative w-full h-[3px] bg-line-4 rounded-full overflow-hidden">
						<div
							className="h-full bg-brand rounded-full transition-all"
							style={{
								width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%`,
							}}
						/>
					</div>
				</div>
			)}

			{error && (
				<div className="px-4 py-2.5 mb-4 rounded border bg-red-50 border-danger-border text-danger text-[13px] max-w-[760px]">
					{error}
				</div>
			)}

			{/* Table */}
			<div className="bg-surface border border-line rounded overflow-hidden">
				<div
					className="grid px-5 py-3 bg-surface-2 border-b border-line text-[10.5px] font-bold text-muted tracking-[.04em]"
					style={{ gridTemplateColumns: COLS }}>
					<div>ITEM</div>
					<div>REORDER POINT</div>
					<div>MAX CAPACITY</div>
					<div className="text-right">DECISION</div>
				</div>

				{suggestions === null ? (
					<div className="px-5 py-14 text-center">
						<div className="text-[14px] font-bold text-heading mb-1">
							Nothing computed yet
						</div>
						<p className="text-[13px] text-muted-2 m-0 max-w-[520px] mx-auto leading-relaxed">
							Suggestions are worked out from each item’s trailing 365-day sales
							and the lost sales you have logged. That is one report call per
							item, so it runs only when you ask.
						</p>
					</div>
				) : visible.length === 0 ? (
					<div className="px-5 py-14 text-center">
						<div className="text-[14px] font-bold text-heading mb-1">
							{busy
								? 'Working…'
								: suggestions.length === 0
									? 'No changes worth making'
									: 'All suggestions reviewed'}
						</div>
						<p className="text-[13px] text-muted-2 m-0">
							{busy
								? 'No suggestions yet. Rows appear here as they are found.'
								: suggestions.length === 0
									? `Checked ${scanned} item${scanned === 1 ? '' : 's'}; every reorder point and max capacity is already close enough to demand.`
									: `${counts.approved} approved${counts.rejected > 0 ? `, ${counts.rejected} rejected` : ''}.`}
						</p>
					</div>
				) : (
					visible.map((s) => (
						<div
							key={s.item_id}
							className="grid px-5 py-[15px] border-b border-line-4 items-center bg-surface"
							style={{ gridTemplateColumns: COLS }}>
							<div className="pr-4 min-w-0">
								<div className="font-bold text-[14px] text-body truncate">
									{s.item_name}
								</div>
								<div
									className="text-[11.5px] text-muted-2 mt-[3px] truncate"
									title={s.reason}>
									{subLineFor(s)}
								</div>
							</div>

							<Pair prev={s.current_rop} next={s.proposed_rop} />
							<Pair prev={s.current_max} next={s.proposed_max} />

							<div className="flex items-center justify-end gap-2">
								<button
									onClick={() => decide(s, 'approved')}
									title="Approve"
									aria-label={`Approve ${s.item_name}`}
									className="w-[34px] h-[34px] rounded border border-[#bfe5cf] bg-[#e7f6ee] flex items-center justify-center cursor-pointer hover:brightness-95">
									<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1a9d54" strokeWidth="2.6">
										<path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
									</svg>
								</button>
								<button
									onClick={() => decide(s, 'rejected')}
									title="Reject"
									aria-label={`Reject ${s.item_name}`}
									className="w-[34px] h-[34px] rounded border border-danger-border bg-surface flex items-center justify-center cursor-pointer hover:bg-red-50">
									<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#e0322b" strokeWidth="2.4" strokeLinecap="round">
										<path d="M6 6l12 12M18 6L6 18" />
									</svg>
								</button>
							</div>
						</div>
					))
				)}
			</div>

			<div className="flex justify-between items-center mt-4 text-[13px] text-muted gap-4 flex-wrap">
				<span className="num">
					{suggestions
						? `${counts.approved} approved · ${counts.pending} pending${counts.rejected > 0 ? ` · ${counts.rejected} rejected` : ''}`
						: ''}
				</span>
			</div>

			{/* The decisions are not yet written anywhere, and saying so is the
			    difference between a review screen and a misleading one. */}
			{suggestions && suggestions.length > 0 && (
				<div className="mt-4 flex items-start gap-2.5 px-4 py-3 rounded border border-warn-border bg-warn-bg text-warn-2 max-w-[760px]">
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="flex-shrink-0 mt-px">
						<circle cx="12" cy="12" r="9" />
						<path d="M12 8v5M12 16h.01" />
					</svg>
					<div className="text-[12.5px] leading-relaxed">
						<span className="font-bold">Approving does not update Zoho yet.</span>{' '}
						The figures are real, but write-back is not built — decisions are
						kept only until you leave this page. Confidence reads low on every
						row because there is no daily stock history to correct demand for
						the days an item was unavailable.
					</div>
				</div>
			)}

			{toasts.length > 0 && (
				<div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2.5 items-end pointer-events-none max-h-[calc(100vh-100px)] overflow-y-auto">
					{toasts.map((t) => (
						<div key={t.tid} className="pointer-events-auto">
							<UndoToast
								label={t.label}
								duration={UNDO_WINDOW}
								onUndo={() => undo(t)}
								onExpire={() => dismiss(t.tid)}
							/>
						</div>
					))}
				</div>
			)}
		</div>
	);
}


/**
 * current → proposed. The new value is emphasised in blue when it moves and
 * left grey when it does not, so an unchanged value reads as "nothing to do".
 * The delta is green going up, red going down.
 */
function Pair({ prev, next }) {
	// A suppressed proposal (materiality) comes back null — treat it as unchanged.
	const to = next == null ? prev : next;
	const same = to === prev;
	const up = to > prev;

	return (
		<div className="flex items-center gap-[11px] pr-4 min-w-0">
			<span className="num text-[15px] text-muted-2">{prev}</span>
			<svg width="18" height="14" viewBox="0 0 24 24" fill="none" stroke="#c4c9d0" strokeWidth="2" className="flex-shrink-0">
				<path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
			</svg>
			<span
				className={`num text-[17px] font-black ${same ? 'text-muted-2' : 'text-link'}`}>
				{to}
			</span>
			{!same && (
				<span
					className={`text-[11px] font-bold ${up ? 'text-ok' : 'text-danger'}`}>
					{up ? `+${to - prev}` : `−${prev - to}`}
				</span>
			)}
		</div>
	);
}
