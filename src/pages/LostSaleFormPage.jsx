import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { getCustomers, getAllItems } from '../components/ZohoAPI';
import { createLostSale, updateLostSale, listLostSales } from '../lib/lostSales';
import Field from '../components/Field';
import ItemPicker from '../components/po/ItemPicker';
import CustomerPicker from '../components/lost/CustomerPicker';
import AdvancedCustomerSearch from '../components/lost/AdvancedCustomerSearch';
import ContactDetails from '../components/ContactDetails';
import DatePicker from '../components/DatePicker';

const today = () => new Date().toISOString().slice(0, 10);

let keySeq = 0;
const nextKey = () => `lost-${++keySeq}`;

const isFilled = (r) => !!(r.item_id || r.isFreeText);

function blankRow() {
	return {
		key: nextKey(),
		item_id: null,
		name: '',
		sku: '',
		isFreeText: false,
		purchase_rate: 0,
		available_stock: 0,
		stock_on_hand: 0,
		qty: '',
	};
}

// Same invariant the PO item table uses: filled rows in order, then exactly one
// blank row to type the next item into.
function normalizeRows(arr) {
	const filled = [];
	let blank = null;
	for (const r of arr) {
		if (isFilled(r)) filled.push(r);
		else blank = r;
	}
	return [...filled, blank ?? blankRow()];
}

function rowFromItem(item) {
	return {
		key: nextKey(),
		item_id: item.item_id,
		name: item.name,
		sku: item.sku || '',
		isFreeText: false,
		purchase_rate: item.purchase_rate ?? item.rate ?? 0,
		available_stock: item.available_stock,
		stock_on_hand: item.stock_on_hand,
		qty: '',
	};
}

export default function LostSaleFormPage() {
	const navigate = useNavigate();
	const { id: editId } = useParams();
	const location = useLocation();
	const isEditing = !!editId;

	// The record being edited, and the date it is stored under — the blob key
	// embeds the month, so the original is needed to move it if the date changes.
	const [original, setOriginal] = useState(null);
	const [loadingRecord, setLoadingRecord] = useState(false);

	const [customers, setCustomers] = useState([]);
	const [customersLoading, setCustomersLoading] = useState(true);
	const [customersError, setCustomersError] = useState(null);
	const [customerId, setCustomerId] = useState(null);
	const [customerName, setCustomerName] = useState('');
	const [customerRecord, setCustomerRecord] = useState(null);
	const [showAdvanced, setShowAdvanced] = useState(false);

	const [allItems, setAllItems] = useState([]);
	const [itemsLoading, setItemsLoading] = useState(true);
	const [itemsError, setItemsError] = useState(null);

	const [date, setDate] = useState(today());
	const [note, setNote] = useState('');
	const [rows, setRows] = useState([blankRow()]);

	const [errors, setErrors] = useState({});
	const [saving, setSaving] = useState(false);
	const [result, setResult] = useState(null);

	// ─── Load the record being edited ─────────────────────────────────────────
	// The list hands it over through router state; a direct link or a refresh
	// has none, so fall back to fetching and finding it.
	useEffect(() => {
		if (!isEditing) return undefined;
		let cancelled = false;

		const apply = (rec) => {
			if (cancelled || !rec) return;
			setOriginal(rec);
			setCustomerId(rec.customer_id || null);
			setCustomerName(rec.customer_name || '');
			setDate(rec.date);
			setNote(rec.note || '');
			setRows([
				{
					key: nextKey(),
					item_id: rec.item_id || null,
					name: rec.item_name || '',
					sku: '',
					isFreeText: !!rec.is_free_text,
					purchase_rate: 0,
					available_stock: 0,
					stock_on_hand: 0,
					qty: String(rec.qty_wanted ?? ''),
				},
			]);
		};

		const handed = location.state?.record;
		if (handed && handed.id === editId) {
			apply(handed);
			return undefined;
		}

		setLoadingRecord(true);
		listLostSales()
			.then((all) => {
				const found = all.find((r) => r.id === editId);
				if (!found) {
					if (!cancelled) {
						setResult({
							success: false,
							message: 'That lost sale no longer exists.',
						});
					}
					return;
				}
				apply(found);
			})
			.catch(
				(e) =>
					!cancelled &&
					setResult({ success: false, message: e.message || 'Could not load it.' }),
			)
			.finally(() => !cancelled && setLoadingRecord(false));

		return () => {
			cancelled = true;
		};
	}, [isEditing, editId, location.state]);

	// ─── Reference data ───────────────────────────────────────────────────────
	useEffect(() => {
		let cancelled = false;

		getCustomers()
			.then((c) => !cancelled && setCustomers(c))
			.catch(
				(e) =>
					!cancelled &&
					setCustomersError(e.message || 'Could not load customers.'),
			)
			.finally(() => !cancelled && setCustomersLoading(false));

		getAllItems((soFar) => {
			if (!cancelled) setAllItems(soFar.slice());
		})
			.then((i) => !cancelled && setAllItems(i))
			.catch(
				(e) =>
					!cancelled &&
					setItemsError(e.message || 'Could not load the item catalogue.'),
			)
			.finally(() => !cancelled && setItemsLoading(false));

		return () => {
			cancelled = true;
		};
	}, []);

	const updateRows = useCallback((updater) => {
		setRows((prev) =>
			normalizeRows(typeof updater === 'function' ? updater(prev) : updater),
		);
	}, []);

	const pickCustomer = (id, record) => {
		setCustomerId(id);
		setCustomerName(record?.contact_name || '');
		setCustomerRecord(record || null);
		setErrors((e) => ({ ...e, customer: null }));
	};

	const addFreeTextCustomer = (text) => {
		setCustomerId(null);
		setCustomerName(text);
		setCustomerRecord(null);
		setErrors((e) => ({ ...e, customer: null }));
	};

	const pickItem = (key, item) =>
		updateRows((prev) =>
			prev.map((r) => (r.key === key ? { ...rowFromItem(item), key: r.key } : r)),
		);

	const setQty = (key, qty) =>
		updateRows((prev) => prev.map((r) => (r.key === key ? { ...r, qty } : r)));

	const removeRow = (key) =>
		updateRows((prev) => prev.filter((r) => r.key !== key));

	const filledRows = useMemo(() => rows.filter(isFilled), [rows]);

	const validate = () => {
		const next = {};

		if (!customerName.trim()) {
			next.customer = 'Select a customer, or type a name to add one.';
		}

		if (!date) {
			next.date = 'A date is required.';
		} else if (date > today()) {
			next.date = 'The date cannot be in the future.';
		}

		if (filledRows.length === 0) {
			next.items = 'Add at least one item.';
		} else if (!filledRows.some((r) => Number(r.qty) > 0)) {
			next.items = 'Enter a quantity wanted for at least one item.';
		} else if (
			filledRows.some((r) => r.qty !== '' && !(Number(r.qty) > 0))
		) {
			next.items = 'Quantities must be greater than zero.';
		}

		setErrors(next);
		return Object.keys(next).length === 0;
	};

	const handleSave = async () => {
		if (saving) return;
		setResult(null);
		if (!validate()) return;

		// One record per item, sharing the customer, date and note — the store
		// keeps a row per item so the reorder engine can total demand by item.
		const toSave = filledRows.filter((r) => Number(r.qty) > 0);

		setSaving(true);
		try {
			let message;

			if (isEditing) {
				// Editing works on the single record that was opened, so only the
				// first row is written back.
				const r = toSave[0];
				await updateLostSale({
					id: editId,
					original_date: original?.date ?? date,
					date,
					customer_id: customerId,
					customer_name: customerName.trim(),
					item_id: r.isFreeText ? null : r.item_id,
					item_name: r.name,
					is_free_text: !!r.isFreeText,
					qty_wanted: Number(r.qty),
					note: note.trim() || null,
				});
				message = `Updated the lost sale for ${customerName.trim()}.`;
			} else {
				for (const r of toSave) {
					await createLostSale({
						date,
						customer_id: customerId,
						customer_name: customerName.trim(),
						item_id: r.isFreeText ? null : r.item_id,
						item_name: r.name,
						is_free_text: !!r.isFreeText,
						qty_wanted: Number(r.qty),
						note: note.trim() || null,
					});
				}
				message = `Recorded ${toSave.length} lost sale${
					toSave.length === 1 ? '' : 's'
				} for ${customerName.trim()}.`;
			}

			navigate('/lost-sales', {
				replace: true,
				state: { lostSaleResult: { success: true, message } },
			});
		} catch (e) {
			setResult({ success: false, message: e.message || 'Could not save.' });
			setSaving(false);
		}
	};

	return (
		<div className="fixed top-[52px] left-[236px] right-0 bottom-0 z-[70] bg-surface flex flex-col">
			{/* Header */}
			<div className="h-16 flex-shrink-0 bg-surface border-b border-line flex items-center justify-between gap-3 px-6">
				<div className="flex items-center gap-3 min-w-0">
					<button
						onClick={() => navigate('/lost-sales')}
						title="Back"
						aria-label="Back"
						className="w-[30px] h-[30px] rounded border border-line bg-surface flex items-center justify-center cursor-pointer flex-shrink-0 hover:bg-surface-2">
						<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#5b6270" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
							<path d="M15 18l-6-6 6-6" />
						</svg>
					</button>
					<div className="flex items-center gap-2.5 min-w-0">
					<h1 className="text-[21px] text-heading font-normal truncate m-0">
						{isEditing ? 'Edit lost sale' : 'Record a lost sale'}
					</h1>
					{filledRows.length > 0 && (
						<span className="text-[12px] font-bold text-link bg-brand-bg rounded-[20px] px-[11px] py-[3px] flex-shrink-0">
							{filledRows.length} item{filledRows.length !== 1 ? 's' : ''}
						</span>
						)}
					</div>
				</div>

				<button
					onClick={() => navigate('/lost-sales')}
					title="Close"
					aria-label="Close"
					className="w-8 h-8 rounded flex items-center justify-center text-muted hover:bg-surface-2 hover:text-body cursor-pointer border-none bg-transparent flex-shrink-0">
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
						<path d="M6 6l12 12M18 6L6 18" />
					</svg>
				</button>
			</div>

			{/* Body */}
			<div className="flex-1 overflow-y-auto overflow-x-hidden">
				{loadingRecord && (
					<div className="px-8 pt-5">
						<div className="px-4 py-2.5 text-[13px] text-body-3 bg-surface-2 border border-line rounded">
							Loading the record…
						</div>
					</div>
				)}

				{result && (
					<div className="px-8 pt-5">
						<div className="flex items-center justify-between px-4 py-2.5 text-[13px] rounded border bg-red-50 border-danger-border text-danger">
							<span>{result.message}</span>
							<button
								onClick={() => setResult(null)}
								className="ml-4 opacity-60 hover:opacity-100 bg-transparent border-none cursor-pointer">
								✕
							</button>
						</div>
					</div>
				)}

				{/* Customer sits on the tinted band, as the vendor does on the PO page */}
				<div className="bg-sidebar border-b border-line px-8 py-6">
					<Field label="Customer" required align="start" error={errors.customer}>
						<CustomerPicker
							customers={customers}
							loading={customersLoading}
							error={customersError}
							value={customerId}
							onChange={pickCustomer}
							onFreeText={addFreeTextCustomer}
							onOpenAdvanced={() => setShowAdvanced(true)}
							invalid={!!errors.customer}
						/>

						{customerId && <ContactDetails contactId={customerId} showShipping={false} />}

						{!customerRecord && customerName && (
							<div className="mt-2 flex items-center gap-2">
								<span className="text-[10px] font-bold text-warn-2 bg-warn-bg border border-warn-border rounded-[20px] px-2 py-px">
									new
								</span>
								<span className="text-[12px] text-muted">
									“{customerName}” is recorded as typed — not linked to a Zoho
									contact.
								</span>
							</div>
						)}
					</Field>
				</div>

				{/* Date + note */}
				<div className="px-8 py-6 flex flex-col gap-5">
					<Field label="Date" required error={errors.date}>
						<DatePicker
							value={date}
							max={today()}
							invalid={!!errors.date}
							onChange={(d) => {
								setDate(d);
								setErrors((x) => ({ ...x, date: null }));
							}}
						/>
					</Field>

					<Field label="Note" align="start">
						<input
							value={note}
							onChange={(e) => setNote(e.target.value)}
							placeholder="e.g. wanted 3, offered a substitute"
							maxLength={280}
							className="w-full h-[38px] border border-line-2 rounded px-3 text-[13.5px] outline-none focus:border-brand"
						/>
					</Field>
				</div>

				{/* Item table */}
				<div className="px-8 pb-6">
					<div className="bg-surface border border-line rounded overflow-visible mr-11">
						<div className="flex items-center justify-between px-[18px] py-[13px] bg-surface-2 border-b border-line">
							<div className="font-bold text-[14px] text-body">Item Table</div>
							{errors.items && (
								<div className="text-[12px] text-danger">{errors.items}</div>
							)}
						</div>

						<div
							className="grid bg-surface-2 border-b border-line text-[10.5px] font-bold text-muted tracking-[.04em]"
							style={{
								gridTemplateColumns: 'minmax(0,2.4fr) minmax(0,1fr)',
							}}>
							<div className="px-3.5 py-2.5 border-r border-line min-w-0">
								ITEM DETAILS
							</div>
							<div className="px-3.5 py-2.5 text-right min-w-0">
								QTY WANTED
							</div>
						</div>

						{rows.map((r) => (
							<div
								key={r.key}
								className="grid border-b border-line items-stretch relative"
								style={{
									gridTemplateColumns: 'minmax(0,2.4fr) minmax(0,1fr)',
								}}>
								<div className="px-3.5 py-3 border-r border-line min-w-0">
									{isFilled(r) ? (
										<div className="pl-2.5">
											<div className="flex items-center gap-[7px] flex-wrap">
												<span className="font-bold text-[13.5px] text-body">
													{r.name}
												</span>
												{r.isFreeText && (
													<span className="text-[10px] font-bold text-warn-2 bg-warn-bg border border-warn-border rounded-[20px] px-2 py-px">
														new
													</span>
												)}
											</div>
											{r.isFreeText ? (
												<div className="text-[11px] text-warn-2 mt-1 leading-[1.35] max-w-[280px]">
													Free-text item — recorded, but excluded from the
													reorder algorithm.
												</div>
											) : (
												<div className="text-[11.5px] text-muted-2 mt-0.5">
													SKU: {r.sku || '—'} · Stock on Hand{' '}
													{Number(r.available_stock ?? r.stock_on_hand ?? 0)}
												</div>
											)}
										</div>
									) : (
										<ItemPicker
											items={allItems}
											loading={itemsLoading}
											error={itemsError}
											onPick={(item) => pickItem(r.key, item)}
										/>
									)}
								</div>

								<div className="px-3.5 py-2.5 min-w-0">
									<input
										type="number"
										min="1"
										value={r.qty}
										onChange={(e) => {
											setQty(r.key, e.target.value);
											setErrors((x) => ({ ...x, items: null }));
										}}
										className="num w-full min-w-0 h-[34px] border border-line rounded px-2.5 text-right text-[13.5px] outline-none focus:border-brand"
									/>
								</div>

								{/* Outside the grid, positioned against the row so it stays
								    centred whatever the row's height. */}
								{isFilled(r) && (
									<button
										onClick={() => removeRow(r.key)}
										title="Remove line"
										aria-label={`Remove ${r.name || 'this line'}`}
										className="absolute right-[-38px] top-1/2 -translate-y-1/2 w-7 h-7 rounded border border-danger-border bg-surface flex items-center justify-center cursor-pointer text-danger hover:bg-red-50">
										<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
											<path d="M3 6h18" />
											<path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
											<path d="M19 6l-1 14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1L5 6" />
											<path d="M10 11v6M14 11v6" />
										</svg>
									</button>
								)}
							</div>
						))}
					</div>
				</div>
			</div>

			{/* Footer */}
			<div className="flex-shrink-0 bg-surface border-t border-line flex items-center gap-3 px-6 py-3">
				<button
					onClick={handleSave}
					disabled={saving}
					className="h-[34px] px-4 rounded border border-brand bg-brand text-white font-bold text-[13px] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2">
					{saving && (
						<span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
					)}
					{saving ? 'Saving…' : isEditing ? 'Save changes' : 'Save lost sale'}
				</button>
				<button
					onClick={() => navigate('/lost-sales')}
					disabled={saving}
					className="h-[34px] px-4 rounded border-none bg-transparent text-body-3 font-bold text-[13px] cursor-pointer disabled:opacity-50 hover:text-body">
					Cancel
				</button>
			</div>

			{showAdvanced && (
				<AdvancedCustomerSearch
					customers={customers}
					loading={customersLoading}
					onClose={() => setShowAdvanced(false)}
					onSelect={(c) => {
						pickCustomer(c.contact_id, c);
						setShowAdvanced(false);
					}}
				/>
			)}
		</div>
	);
}
