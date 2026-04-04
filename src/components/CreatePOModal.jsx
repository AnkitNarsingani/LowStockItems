import { useState, useEffect, useMemo } from 'react';

export default function CreatePOModal({ selectedCount, selectedItems, onClose, onConfirm }) {
	const [mode, setMode] = useState('simple');
	const [bundleSize, setBundleSize] = useState('');
	const [populateRate, setPopulateRate] = useState(false);

	useEffect(() => {
		const prev = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		return () => { document.body.style.overflow = prev; };
	}, []);

	// Total qty for simple mode preview
	const simpleTotalQty = useMemo(() => {
		if (!selectedItems?.length) return 0;
		return selectedItems.reduce((sum, item) => {
			const maxCap = Number(item.cf_maximum_capacity);
			const avail = Number(item.available_stock ?? item.stock_on_hand ?? 0);
			const qty = maxCap - avail;
			return sum + (!isNaN(maxCap) && qty > 0 ? Math.floor(qty) : 0);
		}, 0);
	}, [selectedItems]);

	const isValid = mode === 'simple' || (mode === 'bundle' && Number(bundleSize) > 0);

	const handleConfirm = () => {
		if (!isValid) return;
		onConfirm({ bundleSize: mode === 'bundle' ? Number(bundleSize) : 0, populateRate });
	};

	const spin = (dir) =>
		setBundleSize((prev) => String(Math.max(1, (parseInt(prev) || 0) + dir)));

	return (
		<>
			<style>{`
				@keyframes po-slide-up {
					from { opacity: 0; transform: translateY(20px) scale(.97); }
					to   { opacity: 1; transform: translateY(0)   scale(1);   }
				}
				@keyframes po-expand {
					from { opacity: 0; transform: translateY(-6px); }
					to   { opacity: 1; transform: translateY(0);    }
				}
				.po-modal { animation: po-slide-up .25s cubic-bezier(.34,1.56,.64,1); }
				.po-bundle-input { animation: po-expand .2s ease; }
				.po-radio-card {
					display: flex; align-items: flex-start; gap: 12px;
					padding: 13px 16px;
					border: 1.5px solid #E5E7EB;
					border-radius: 10px;
					cursor: pointer;
					background: #fff;
					transition: border-color .18s, background .18s, box-shadow .18s;
					user-select: none;
				}
				.po-radio-card:hover { border-color: #BFDBFE; background: #EFF6FF; }
				.po-radio-card.po-selected {
					border-color: #3B82F6;
					background: #EFF6FF;
					box-shadow: 0 0 0 3px rgba(59,130,246,.1);
				}
				.po-btn {
					padding: 9px 22px; border-radius: 6px;
					font-size: 13.5px; font-family: inherit; font-weight: 600;
					cursor: pointer; letter-spacing: .01em; transition: all .15s;
				}
				.po-btn-ghost {
					background: transparent; border: 1.5px solid #D1D5DB; color: #6B7280;
				}
				.po-btn-ghost:hover { background: #F9FAFB; color: #111827; }
				.po-btn-primary {
					border: none; background: #3B82F6; color: white;
					box-shadow: 0 2px 6px rgba(59,130,246,.35);
				}
				.po-btn-primary:hover:not(:disabled) {
					background: #1D4ED8;
					box-shadow: 0 4px 12px rgba(59,130,246,.4);
					transform: translateY(-1px);
				}
				.po-btn-primary:active { transform: translateY(0); }
				.po-btn-primary:disabled { opacity: .4; cursor: not-allowed; }
				.po-qty-input {
					flex: 1;
					border: 1.5px solid #D1D5DB; border-right: none;
					border-radius: 6px 0 0 6px;
					padding: 9px 14px;
					font-size: 14px; font-family: 'DM Mono', monospace; font-weight: 500;
					color: #111827; background: #fff; outline: none;
					transition: border-color .2s, box-shadow .2s;
				}
				.po-qty-input:focus { border-color: #3B82F6; box-shadow: 0 0 0 3px rgba(59,130,246,.1); }
				.po-qty-input::placeholder { color: #9CA3AF; font-weight: 400; }
				.po-spin-btn {
					width: 30px; height: 20px; border: none;
					background: #F9FAFB; cursor: pointer;
					display: flex; align-items: center; justify-content: center;
					font-size: 10px; color: #9CA3AF; transition: background .12s, color .12s;
				}
				.po-spin-btn:hover { background: #EFF6FF; color: #3B82F6; }
				.po-close-btn {
					width: 30px; height: 30px; border: none; background: none;
					border-radius: 6px; cursor: pointer;
					display: flex; align-items: center; justify-content: center;
					color: #9CA3AF; margin-top: -2px; transition: background .15s, color .15s;
				}
				.po-close-btn:hover { background: #F9FAFB; color: #111827; }
			`}</style>

			{/* Backdrop */}
			<div
				className="fixed inset-0 z-50 flex items-center justify-center"
				style={{ background: 'rgba(17,24,39,.45)', backdropFilter: 'blur(3px)' }}
				onClick={(e) => e.target === e.currentTarget && onClose()}>

				{/* Modal */}
				<div className="po-modal" style={{
					background: '#fff', borderRadius: '16px', width: '420px', maxWidth: '95vw',
					overflow: 'hidden',
					boxShadow: '0 20px 60px rgba(0,0,0,.14), 0 8px 20px rgba(0,0,0,.08)',
				}}>
					{/* Header */}
					<div style={{ padding: '22px 24px 0', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
						<div>
							<div style={{ fontSize: '16px', fontWeight: 600, color: '#111827' }}>Create Purchase Order</div>
							<div style={{ fontSize: '13px', color: '#9CA3AF', marginTop: '2px' }}>
								{selectedCount} item{selectedCount !== 1 ? 's' : ''} selected
							</div>
						</div>
						<button className="po-close-btn" onClick={onClose}>
							<svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
								<path d="M18 6 6 18M6 6l12 12" />
							</svg>
						</button>
					</div>

					{/* Body */}
					<div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

						{/* Quantity Mode */}
						<div>
							<div style={{
								fontSize: '11px', fontWeight: 600, letterSpacing: '.08em',
								textTransform: 'uppercase', color: '#9CA3AF', marginBottom: '10px',
							}}>
								Quantity Mode
							</div>

							<div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
								{/* Simple */}
								<div
									className={`po-radio-card${mode === 'simple' ? ' po-selected' : ''}`}
									onClick={() => setMode('simple')}>
									<RadioDot selected={mode === 'simple'} />
									<div style={{ flex: 1 }}>
										<div style={{ fontSize: '14px', fontWeight: 600, color: '#111827' }}>Simple</div>
										<div style={{ fontSize: '12.5px', color: '#6B7280', marginTop: '1px', lineHeight: 1.4 }}>
											Qty = Max Capacity − Available Stock
											{mode === 'simple' && simpleTotalQty > 0 && (
												<span style={{ color: '#3B82F6', fontWeight: 600 }}>
													{' '}· Total: {simpleTotalQty.toLocaleString('en-IN')} units
												</span>
											)}
										</div>
									</div>
								</div>

								{/* Bundle */}
								<div
									className={`po-radio-card${mode === 'bundle' ? ' po-selected' : ''}`}
									onClick={() => setMode('bundle')}>
									<RadioDot selected={mode === 'bundle'} />
									<div style={{ flex: 1 }}>
										<div style={{ fontSize: '14px', fontWeight: 600, color: '#111827' }}>Bundle</div>
										<div style={{ fontSize: '12.5px', color: '#6B7280', marginTop: '1px', lineHeight: 1.4 }}>
											Distribute a fixed total qty weighted by sales velocity
										</div>
										{mode === 'bundle' && (
											<div className="po-bundle-input" style={{ marginTop: '12px' }}>
												<div style={{ fontSize: '12px', fontWeight: 500, color: '#6B7280', marginBottom: '6px' }}>
													Total bundle quantity
												</div>
												<div style={{ display: 'flex', alignItems: 'center' }}>
													<input
														className="po-qty-input"
														type="number"
														min="1"
														value={bundleSize}
														onChange={(e) => setBundleSize(e.target.value)}
														placeholder="e.g. 500"
														autoFocus
														onClick={(e) => e.stopPropagation()}
													/>
													<div style={{
														display: 'flex', flexDirection: 'column',
														border: '1.5px solid #D1D5DB',
														borderRadius: '0 6px 6px 0', overflow: 'hidden',
													}}>
														<button className="po-spin-btn" style={{ borderBottom: '1px solid #E5E7EB' }} onClick={(e) => { e.stopPropagation(); spin(1); }}>▲</button>
														<button className="po-spin-btn" onClick={(e) => { e.stopPropagation(); spin(-1); }}>▼</button>
													</div>
												</div>
											</div>
										)}
									</div>
								</div>
							</div>
						</div>

						{/* Divider */}
						<div style={{ height: '1px', background: '#E5E7EB', margin: '0 -24px' }} />

						{/* Rate toggle */}
						<div style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '4px 0' }}>
							<ToggleSwitch checked={populateRate} onChange={setPopulateRate} />
							<div>
								<div style={{ fontSize: '13.5px', fontWeight: 600, color: '#111827' }}>
									Populate rate from last bill
								</div>
								<div style={{ fontSize: '12px', color: '#6B7280', marginTop: '1px', lineHeight: 1.4 }}>
									Looks up the most recent bill from this vendor for each item and uses that rate
								</div>
							</div>
						</div>
					</div>

					{/* Footer */}
					<div style={{
						padding: '16px 24px 20px', display: 'flex',
						alignItems: 'center', justifyContent: 'flex-end', gap: '10px',
						borderTop: '1px solid #E5E7EB',
					}}>
						<button className="po-btn po-btn-ghost" onClick={onClose}>Cancel</button>
						<button className="po-btn po-btn-primary" onClick={handleConfirm} disabled={!isValid}>
							Continue
						</button>
					</div>
				</div>
			</div>
		</>
	);
}

function RadioDot({ selected }) {
	return (
		<div style={{
			width: '18px', height: '18px', borderRadius: '50%', flexShrink: 0, marginTop: '1px',
			border: `2px solid ${selected ? '#3B82F6' : '#D1D5DB'}`,
			background: selected ? '#3B82F6' : 'transparent',
			display: 'flex', alignItems: 'center', justifyContent: 'center',
			transition: 'border-color .18s, background .18s',
		}}>
			{selected && <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#fff' }} />}
		</div>
	);
}

function ToggleSwitch({ checked, onChange }) {
	return (
		<div
			onClick={() => onChange(!checked)}
			style={{ position: 'relative', width: '38px', height: '22px', flexShrink: 0, cursor: 'pointer' }}>
			<div style={{
				position: 'absolute', inset: 0, borderRadius: '11px',
				background: checked ? '#3B82F6' : '#D1D5DB',
				transition: 'background .2s',
			}} />
			<div style={{
				position: 'absolute', top: '3px', left: '3px',
				width: '16px', height: '16px', borderRadius: '50%',
				background: 'white', boxShadow: '0 1px 3px rgba(0,0,0,.2)',
				transform: checked ? 'translateX(16px)' : 'translateX(0)',
				transition: 'transform .2s cubic-bezier(.34,1.56,.64,1)',
			}} />
		</div>
	);
}
