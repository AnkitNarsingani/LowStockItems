import { useState, useEffect, useMemo } from 'react';

const S = {
	overlay: {
		position: 'fixed',
		inset: 0,
		zIndex: 9999,
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'center',
		background: 'rgba(17,24,39,.5)',
		backdropFilter: 'blur(4px)',
	},
	modal: {
		background: '#fff',
		borderRadius: '16px',
		width: '440px',
		maxWidth: 'calc(100vw - 32px)',
		boxShadow: '0 24px 64px rgba(0,0,0,.18), 0 8px 24px rgba(0,0,0,.1)',
		fontFamily:
			"'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
		animation: 'cpoSlideUp .22s cubic-bezier(.34,1.4,.64,1)',
		overflow: 'hidden',
		textAlign: 'left',
	},
	header: {
		padding: '22px 24px 0',
		display: 'flex',
		alignItems: 'flex-start',
		justifyContent: 'space-between',
		gap: '12px',
	},
	title: {
		fontSize: '19px',
		fontWeight: 500,
		color: '#111827',
		lineHeight: 1.2,
		textAlign: 'left',
	},
	subtitle: {
		fontSize: '14px',
		color: '#9CA3AF',
		marginTop: '3px',
		textAlign: 'left',
	},
	closeBtn: {
		flexShrink: 0,
		width: '28px',
		height: '28px',
		border: 'none',
		background: 'none',
		borderRadius: '6px',
		cursor: 'pointer',
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'center',
		color: '#9CA3AF',
		marginTop: '-2px',
		transition: 'background .15s, color .15s',
	},
	body: {
		padding: '18px 24px 20px',
		display: 'flex',
		flexDirection: 'column',
		gap: '18px',
		textAlign: 'left',
	},
	sectionLabel: {
		fontSize: '12px',
		fontWeight: 500,
		letterSpacing: '.1em',
		textTransform: 'uppercase',
		color: '#9CA3AF',
		marginBottom: '10px',
		textAlign: 'left',
	},
	radioGroup: { display: 'flex', flexDirection: 'column', gap: '8px' },
	divider: { height: '1px', background: '#E5E7EB', margin: '0 -24px' },
	toggleRow: { display: 'flex', alignItems: 'flex-start', gap: '14px' },
	toggleTextBlock: { flex: 1, textAlign: 'left' },
	toggleTitle: {
		fontSize: '15.5px',
		fontWeight: 500,
		color: '#111827',
		lineHeight: 1.3,
		textAlign: 'left',
	},
	toggleDesc: {
		fontSize: '14px',
		color: '#6B7280',
		marginTop: '3px',
		lineHeight: 1.45,
		textAlign: 'left',
	},
	footer: {
		padding: '14px 24px 20px',
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'flex-end',
		gap: '10px',
		borderTop: '1px solid #E5E7EB',
	},
};

export default function CreatePOModal({
	selectedCount,
	selectedItems,
	onClose,
	onConfirm,
	creating = false,
}) {
	const [mode, setMode] = useState('simple');
	const [bundleSize, setBundleSize] = useState('');
	const [populateRate, setPopulateRate] = useState(true);
	const [discount, setDiscount] = useState('');
	const [discountType, setDiscountType] = useState('%');
	const [roundOff, setRoundOff] = useState(true);

	useEffect(() => {
		const prev = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		return () => {
			document.body.style.overflow = prev;
		};
	}, []);

	const simpleTotalQty = useMemo(() => {
		if (!selectedItems?.length) return 0;
		return selectedItems.reduce((sum, item) => {
			const maxCap = Number(item.cf_maximum_capacity);
			const avail = Number(item.available_stock ?? item.stock_on_hand ?? 0);
			const qty = maxCap - avail;
			return sum + (!isNaN(maxCap) && qty > 0 ? Math.floor(qty) : 0);
		}, 0);
	}, [selectedItems]);

	const isValid =
		mode === 'simple' || (mode === 'bundle' && Number(bundleSize) > 0);

	const handleConfirm = () => {
		if (!isValid) return;
		onConfirm({
			bundleSize: mode === 'bundle' ? Number(bundleSize) : 0,
			populateRate,
			// discount and roundOff are only meaningful when rates are populated;
			// ignore any lingering state if the toggle is off
			discount: populateRate && discount !== '' ? Number(discount) : 0,
			discountType,
			roundOff: populateRate && roundOff,
		});
	};

	const spin = (dir) =>
		setBundleSize((prev) => String(Math.max(1, (parseInt(prev) || 0) + dir)));

	return (
		<>
			<style>{`
				@keyframes cpoSlideUp {
					from { opacity:0; transform:translateY(20px) scale(.96); }
					to   { opacity:1; transform:translateY(0) scale(1); }
				}
				@keyframes cpoBundleIn {
					from { opacity:0; transform:translateY(-4px); }
					to   { opacity:1; transform:translateY(0); }
				}
				.cpo-radio-card {
					display:flex; align-items:flex-start; gap:12px;
					padding:13px 16px; border-radius:10px; cursor:pointer;
					border:1.5px solid #E5E7EB; background:#fff;
					transition:border-color .15s, background .15s, box-shadow .15s;
					user-select:none; text-align:left;
				}
				.cpo-radio-card:hover { border-color:#BFDBFE; background:#F5F9FF; }
				.cpo-radio-card.cpo-sel {
					border-color:#3B82F6; background:#EFF6FF;
					box-shadow:0 0 0 3px rgba(59,130,246,.12);
				}
				.cpo-dot {
					width:18px; height:18px; border-radius:50%; flex-shrink:0; margin-top:2px;
					border:2px solid #D1D5DB; background:#fff;
					display:flex; align-items:center; justify-content:center;
					transition:border-color .15s, background .15s;
				}
				.cpo-radio-card.cpo-sel .cpo-dot { border-color:#3B82F6; background:#3B82F6; }
				.cpo-dot-inner { width:6px; height:6px; border-radius:50%; background:#fff; }
				.cpo-card-title { font-size:15.5px; font-weight:500; color:#111827; text-align:left; }
				.cpo-card-desc  { font-size:14px; color:#6B7280; margin-top:2px; line-height:1.45; text-align:left; }
				.cpo-bundle-wrap { margin-top:12px; animation:cpoBundleIn .18s ease; }
				.cpo-input-label { font-size:13.5px; font-weight:400; color:#6B7280; margin-bottom:6px; text-align:left; }
				.cpo-qty-row { display:flex; }
				.cpo-qty-input {
					flex:1; border:1.5px solid #D1D5DB; border-right:none;
					border-radius:6px 0 0 6px; padding:9px 14px;
					font-size:14px; font-family:'DM Mono',monospace; font-weight:500;
					color:#111827; background:#fff; outline:none;
					transition:border-color .15s, box-shadow .15s;
				}
				.cpo-qty-input:focus { border-color:#3B82F6; box-shadow:0 0 0 3px rgba(59,130,246,.1); }
				.cpo-qty-input::placeholder { color:#C4C9D4; font-weight:400; }
				.cpo-spinners {
					display:flex; flex-direction:column;
					border:1.5px solid #D1D5DB; border-radius:0 6px 6px 0; overflow:hidden;
				}
				.cpo-spin {
					width:28px; height:50%; border:none; background:#F9FAFB;
					cursor:pointer; display:flex; align-items:center; justify-content:center;
					color:#9CA3AF; font-size:9px; transition:background .12s, color .12s;
				}
				.cpo-spin:first-child { border-bottom:1px solid #E5E7EB; }
				.cpo-spin:hover { background:#EFF6FF; color:#3B82F6; }
				.cpo-toggle-track {
					position:relative; width:38px; height:22px; flex-shrink:0;
					border-radius:11px; cursor:pointer; margin-top:1px;
					transition:background .2s;
				}
				.cpo-toggle-thumb {
					position:absolute; top:3px; left:3px;
					width:16px; height:16px; border-radius:50%;
					background:#fff; box-shadow:0 1px 3px rgba(0,0,0,.2);
					transition:transform .2s cubic-bezier(.34,1.56,.64,1);
				}
				.cpo-discount-row {
					display:flex; align-items:center; justify-content:space-between; gap:12px;
				}
				.cpo-discount-label { font-size:15.5px; font-weight:500; color:#111827; text-align:left; }
				.cpo-discount-desc  { font-size:14px; color:#6B7280; margin-top:3px; line-height:1.45; text-align:left; }
				.cpo-discount-controls { display:flex; align-items:center; gap:8px; flex-shrink:0; }
				.cpo-type-group { display:flex; border:1.5px solid #D1D5DB; border-radius:6px; overflow:hidden; }
				.cpo-type-btn {
					width:34px; height:36px; border:none; cursor:pointer;
					font-size:13px; font-weight:500; font-family:inherit;
					background:#F9FAFB; color:#6B7280;
					transition:background .13s, color .13s;
				}
				.cpo-type-btn:first-child { border-right:1px solid #D1D5DB; }
				.cpo-type-btn.cpo-type-sel { background:#3B82F6; color:#fff; }
				.cpo-type-btn:not(.cpo-type-sel):hover { background:#EFF6FF; color:#3B82F6; }
				.cpo-discount-input {
					width:70px; border:1.5px solid #D1D5DB; border-radius:6px;
					padding:8px 10px; outline:none;
					font-size:14px; font-family:'DM Mono',monospace; font-weight:500;
					color:#111827; background:#fff; text-align:right;
					transition:border-color .15s, box-shadow .15s;
				}
				.cpo-discount-input:focus { border-color:#3B82F6; box-shadow:0 0 0 3px rgba(59,130,246,.1); }
				.cpo-discount-input::placeholder { color:#C4C9D4; font-weight:400; }
				.cpo-btn {
					padding:10px 26px; border-radius:7px;
					font-size:15px; font-family:inherit; font-weight:500;
					cursor:pointer; letter-spacing:.01em; transition:all .15s; border:none;
				}
				.cpo-cancel {
					background:#fff; border:1.5px solid #D1D5DB; color:#374151;
				}
				.cpo-cancel:hover { background:#F9FAFB; border-color:#9CA3AF; }
				.cpo-confirm {
					background:#3B82F6; color:#fff;
					box-shadow:0 2px 8px rgba(59,130,246,.4);
				}
				.cpo-confirm:hover:not(:disabled) { background:#2563EB; box-shadow:0 4px 14px rgba(59,130,246,.45); transform:translateY(-1px); }
				.cpo-confirm:active { transform:translateY(0); }
				.cpo-confirm:disabled { opacity:.4; cursor:not-allowed; transform:none; box-shadow:none; }
				@keyframes cpoSpin { to { transform:rotate(360deg); } }
				.cpo-spinner { width:14px; height:14px; border:2px solid rgba(255,255,255,.4); border-top-color:#fff; border-radius:50%; animation:cpoSpin .7s linear infinite; display:inline-block; }
			`}</style>

			<div
				style={S.overlay}
				onClick={(e) => {
					if (!creating && e.target === e.currentTarget) onClose();
				}}>
				<div style={S.modal}>
					{/* ── Header ── */}
					<div style={S.header}>
						<div>
							<div style={S.title}>Create Purchase Order</div>
							<div style={S.subtitle}>
								{selectedCount} item{selectedCount !== 1 ? 's' : ''} selected
							</div>
						</div>
						<button
							style={S.closeBtn}
							onClick={onClose}
							disabled={creating}
							onMouseEnter={(e) => {
								if (!creating) {
									e.currentTarget.style.background = '#F3F4F6';
									e.currentTarget.style.color = '#111827';
								}
							}}
							onMouseLeave={(e) => {
								e.currentTarget.style.background = 'none';
								e.currentTarget.style.color = '#9CA3AF';
							}}>
							<svg
								width="15"
								height="15"
								fill="none"
								stroke="currentColor"
								strokeWidth="2.5"
								viewBox="0 0 24 24">
								<path d="M18 6 6 18M6 6l12 12" />
							</svg>
						</button>
					</div>

					{/* ── Body ── */}
					<div style={S.body}>
						{/* Quantity mode */}
						<div>
							<div style={S.sectionLabel}>Quantity Mode</div>
							<div style={S.radioGroup}>
								{/* Simple */}
								<div
									className={`cpo-radio-card${mode === 'simple' ? ' cpo-sel' : ''}`}
									onClick={() => setMode('simple')}>
									<div className="cpo-dot">
										{mode === 'simple' && <div className="cpo-dot-inner" />}
									</div>
									<div style={{ flex: 1 }}>
										<div className="cpo-card-title">Simple</div>
										<div className="cpo-card-desc">
											Qty = Max Capacity − Available Stock
											{mode === 'simple' && simpleTotalQty > 0 && (
												<span style={{ color: '#3B82F6', fontWeight: 500 }}>
													{' · '}Total: {simpleTotalQty.toLocaleString('en-IN')}{' '}
													units
												</span>
											)}
										</div>
									</div>
								</div>

								{/* Bundle */}
								<div
									className={`cpo-radio-card${mode === 'bundle' ? ' cpo-sel' : ''}`}
									onClick={() => setMode('bundle')}>
									<div className="cpo-dot">
										{mode === 'bundle' && <div className="cpo-dot-inner" />}
									</div>
									<div style={{ flex: 1 }}>
										<div className="cpo-card-title">Bundle</div>
										<div className="cpo-card-desc">
											Distribute a fixed total qty weighted by sales velocity
										</div>
										{mode === 'bundle' && (
											<div className="cpo-bundle-wrap">
												<div className="cpo-input-label">
													Total bundle quantity
												</div>
												<div className="cpo-qty-row">
													<input
														className="cpo-qty-input"
														type="number"
														min="1"
														value={bundleSize}
														onChange={(e) => setBundleSize(e.target.value)}
														placeholder="e.g. 500"
														autoFocus
														onClick={(e) => e.stopPropagation()}
													/>
													<div className="cpo-spinners">
														<button
															className="cpo-spin"
															onClick={(e) => {
																e.stopPropagation();
																spin(1);
															}}>
															▲
														</button>
														<button
															className="cpo-spin"
															onClick={(e) => {
																e.stopPropagation();
																spin(-1);
															}}>
															▼
														</button>
													</div>
												</div>
											</div>
										)}
									</div>
								</div>
							</div>
						</div>

						<div style={S.divider} />

						{/* Rate toggle */}
						<div style={S.toggleRow}>
							<div
								className="cpo-toggle-track"
								style={{ background: populateRate ? '#3B82F6' : '#D1D5DB' }}
								onClick={() => setPopulateRate((v) => !v)}>
								<div
									className="cpo-toggle-thumb"
									style={{
										transform: populateRate
											? 'translateX(16px)'
											: 'translateX(0)',
									}}
								/>
							</div>
							<div style={S.toggleTextBlock}>
								<div style={S.toggleTitle}>Populate rate from last bill</div>
								<div style={S.toggleDesc}>
									Looks up the most recent bill from this vendor for each item
									and uses that rate
								</div>
							</div>
						</div>

						{populateRate && (
							<>
								<div style={S.divider} />

								{/* Discount */}
								<div className="cpo-discount-row">
									<div>
										<div className="cpo-discount-label">Discount</div>
										<div className="cpo-discount-desc">
											{discountType === '%'
												? 'Percentage off the PO subtotal'
												: 'Flat amount off the PO total'}
										</div>
									</div>
									<div className="cpo-discount-controls">
										<div className="cpo-type-group">
											<button
												className={`cpo-type-btn${discountType === '%' ? ' cpo-type-sel' : ''}`}
												onClick={() => setDiscountType('%')}>
												%
											</button>
											<button
												className={`cpo-type-btn${discountType === '₹' ? ' cpo-type-sel' : ''}`}
												onClick={() => setDiscountType('₹')}>
												₹
											</button>
										</div>
										<input
											className="cpo-discount-input"
											type="number"
											min="0"
											step={discountType === '%' ? '0.1' : '1'}
											max={discountType === '%' ? '100' : undefined}
											value={discount}
											onChange={(e) => setDiscount(e.target.value)}
											placeholder="0"
										/>
									</div>
								</div>

								<div style={S.divider} />

								{/* Round off toggle */}
								<div style={S.toggleRow}>
									<div
										className="cpo-toggle-track"
										style={{ background: roundOff ? '#3B82F6' : '#D1D5DB' }}
										onClick={() => setRoundOff((v) => !v)}>
										<div
											className="cpo-toggle-thumb"
											style={{
												transform: roundOff
													? 'translateX(16px)'
													: 'translateX(0)',
											}}
										/>
									</div>
									<div style={S.toggleTextBlock}>
										<div style={S.toggleTitle}>Round off</div>
										<div style={S.toggleDesc}>
											Adds a round-off adjustment to the PO total
										</div>
									</div>
								</div>
							</>
						)}
					</div>

					{/* ── Footer ── */}
					<div style={S.footer}>
						<button
							className="cpo-btn cpo-cancel"
							onClick={onClose}
							disabled={creating}>
							Cancel
						</button>
						<button
							className="cpo-btn cpo-confirm"
							onClick={handleConfirm}
							disabled={!isValid || creating}>
							{creating ? <span className="cpo-spinner" /> : 'Continue'}
						</button>
					</div>
				</div>
			</div>
		</>
	);
}
