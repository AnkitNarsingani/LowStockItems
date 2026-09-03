import { useState, useMemo, useRef, useCallback } from 'react';
import { SEED_SUGGESTIONS, subLineFor } from '../lib/reorderSeed';
import UndoToast from '../components/UndoToast';

const COLS = 'minmax(0,2.4fr) minmax(0,1.6fr) minmax(0,1.6fr) 130px';
const UNDO_WINDOW = 5000;

/**
 * Reorder-point suggestion review.
 *
 * A decision takes the row off the list straight away and raises a countdown
 * toast; until the timer runs out the decision can still be taken back, which
 * puts the row back where it was. The list therefore only ever shows what still
 * needs attention.
 *
 * The engine behind this (Engine B) does not exist yet; rows come from
 * src/lib/reorderSeed.js. Approve and reject are local state only — nothing is
 * sent to Zoho from this screen.
 */
export default function ReorderSuggestionsPage() {
	// pending | approved | rejected, keyed by item_id.
	const [status, setStatus] = useState(() =>
		Object.fromEntries(SEED_SUGGESTIONS.map((s) => [s.item_id, 'pending'])),
	);
	const [toasts, setToasts] = useState([]);
	const toastSeq = useRef(0);

	const dismiss = useCallback((tid) => {
		setToasts((list) => list.filter((t) => t.tid !== tid));
	}, []);

	const undo = useCallback(
		(toast) => {
			// Restore exactly what those rows were before the decision.
			setStatus((prev) => ({ ...prev, ...toast.previous }));
			dismiss(toast.tid);
		},
		[dismiss],
	);

	const pushToast = (previous, label) => {
		const tid = ++toastSeq.current;
		setToasts((list) => [...list, { tid, previous, label }]);
	};

	const decide = (suggestion, next) => {
		const previous = { [suggestion.item_id]: status[suggestion.item_id] };
		setStatus((prev) => ({ ...prev, [suggestion.item_id]: next }));
		pushToast(
			previous,
			`${next === 'approved' ? 'Approving' : 'Rejecting'} ${suggestion.item_name}`,
		);
	};

	const approveAll = () => {
		// A rejected row stays rejected — "approve all" should not quietly
		// reverse a decision already made.
		const targets = SEED_SUGGESTIONS.filter(
			(s) => status[s.item_id] === 'pending',
		);
		if (targets.length === 0) return;

		setStatus((prev) => {
			const next = { ...prev };
			for (const s of targets) next[s.item_id] = 'approved';
			return next;
		});

		// One toast per item rather than a single "Approving N" summary, so each
		// can be undone on its own.
		for (const s of targets) {
			pushToast({ [s.item_id]: 'pending' }, `Approving ${s.item_name}`);
		}
	};

	const reset = () => {
		setStatus(
			Object.fromEntries(SEED_SUGGESTIONS.map((s) => [s.item_id, 'pending'])),
		);
		setToasts([]);
	};

	// Only what still needs a decision stays on the list.
	const visible = useMemo(
		() => SEED_SUGGESTIONS.filter((s) => status[s.item_id] === 'pending'),
		[status],
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
				<button
					onClick={approveAll}
					disabled={counts.pending === 0}
					className="h-9 px-[18px] rounded border border-brand bg-brand text-white font-bold text-[13px] cursor-pointer shadow-[0_1px_2px_rgba(64,141,251,.35)] disabled:opacity-40 disabled:cursor-not-allowed">
					Approve all
				</button>
			</div>

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

				{visible.length === 0 ? (
					<div className="px-5 py-14 text-center">
						<div className="text-[14px] font-bold text-heading mb-1">
							All suggestions reviewed
						</div>
						<p className="text-[13px] text-muted-2 m-0 mb-4">
							{counts.approved} approved
							{counts.rejected > 0 ? `, ${counts.rejected} rejected` : ''}.
						</p>
						<button
							onClick={reset}
							className="h-9 px-4 rounded border border-line-2 bg-surface text-body-2 font-bold text-[12.5px] cursor-pointer hover:bg-surface-2">
							Start over
						</button>
					</div>
				) : (
					visible.map((s) => (
						<div
							key={s.item_id}
							className="grid px-5 py-[15px] border-b border-line-4 items-center bg-surface"
							style={{ gridTemplateColumns: COLS }}>
							{/* Item */}
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

							{/* Decision */}
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

			<div className="mt-4 text-[13px] text-muted">
				<span className="num">
					{counts.approved} approved · {counts.pending} pending
					{counts.rejected > 0 ? ` · ${counts.rejected} rejected` : ''}
				</span>
			</div>

			{/* Decision toasts — bottom right, newest lowest, each with its own timer. */}
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
 * left grey when it does not, so an unchanged row reads as "nothing to do".
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
