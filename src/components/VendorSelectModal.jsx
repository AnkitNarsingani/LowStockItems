import { useState, useEffect, useRef } from 'react';
import { getVendors } from './ZohoAPI';

export default function VendorSelectModal({
	selectedItems,
	onClose,
	onConfirm,
	creating,
}) {
	const [vendors, setVendors] = useState([]);
	const [vendorsLoading, setVendorsLoading] = useState(true);
	const [vendorError, setVendorError] = useState(null);
	const [selectedVendorId, setSelectedVendorId] = useState('');

	// Lock body scroll while modal is open
	useEffect(() => {
		const prev = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		return () => {
			document.body.style.overflow = prev;
		};
	}, []);

	useEffect(() => {
		let cancelled = false;
		setVendorsLoading(true);
		setVendorError(null);
		getVendors()
			.then((v) => {
				if (!cancelled) {
					setVendors(v);
					setVendorsLoading(false);
				}
			})
			.catch((err) => {
				if (!cancelled) {
					setVendorError(err.message || 'Failed to load vendors');
					setVendorsLoading(false);
				}
			});
		return () => {
			cancelled = true;
		};
	}, []);

	const preferredVendors = [
		...new Map(
			selectedItems
				.filter((i) => i.vendor_id)
				.map((i) => [i.vendor_id, { id: i.vendor_id, name: i.vendor_name }]),
		).values(),
	];

	const handleConfirm = () => {
		if (!selectedVendorId) return;
		onConfirm(selectedVendorId);
	};

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center"
			style={{ background: 'rgba(0,0,0,0.35)' }}
			onClick={(e) => e.target === e.currentTarget && onClose()}>
			{/* Remove overflow-hidden so the dropdown list isn't clipped */}
			<div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
				{/* Header */}
				<div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
					<div>
						<h2 className="text-sm font-semibold text-gray-900">
							Select Vendor for Purchase Order
						</h2>
						<p className="text-xs text-gray-400 mt-0.5">
							{selectedItems.length} item{selectedItems.length !== 1 ? 's' : ''}{' '}
							selected · multiple preferred vendors detected
						</p>
					</div>
					<button
						onClick={onClose}
						disabled={creating}
						className="text-gray-400 hover:text-gray-600 text-lg leading-none disabled:opacity-50">
						✕
					</button>
				</div>

				{/* Preferred vendors hint */}
				{preferredVendors.length > 0 && (
					<div className="px-5 py-3 border-b border-gray-100 bg-gray-50 rounded-none">
						<p className="text-xs text-gray-500 mb-1.5 font-medium">
							Preferred vendors among selected items:
						</p>
						<div className="flex flex-wrap gap-1.5">
							{preferredVendors.map((v) => (
								<button
									key={v.id}
									onClick={() => setSelectedVendorId(v.id)}
									className={`text-xs px-2 py-1 rounded-full border transition-colors ${
										selectedVendorId === v.id
											? 'bg-blue-500 text-white border-blue-500'
											: 'bg-white text-gray-600 border-gray-200 hover:border-blue-300 hover:text-blue-600'
									}`}>
									{v.name}
								</button>
							))}
						</div>
					</div>
				)}

				{/* Vendor dropdown — needs extra bottom padding so the open list isn't cut off */}
				<div className="px-5 pt-4 pb-40">
					<label className="text-xs font-medium text-gray-600 block mb-2">
						Or search all vendors
					</label>
					{vendorError ? (
						<p className="text-xs text-red-500">{vendorError}</p>
					) : (
						<SearchableVendorSelect
							vendors={vendors}
							loading={vendorsLoading}
							value={selectedVendorId}
							onChange={setSelectedVendorId}
						/>
					)}
				</div>

				{/* Footer */}
				<div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-100">
					<button
						onClick={onClose}
						disabled={creating}
						className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50">
						Cancel
					</button>
					<button
						onClick={handleConfirm}
						disabled={!selectedVendorId || creating}
						className="text-xs px-4 py-1.5 rounded-lg bg-blue-500 text-white font-medium hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5">
						{creating && (
							<span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
						)}
						{creating ? 'Creating…' : 'Create PO'}
					</button>
				</div>
			</div>
		</div>
	);
}

function SearchableVendorSelect({ vendors, loading, value, onChange }) {
	const [search, setSearch] = useState('');
	const [open, setOpen] = useState(false);
	const containerRef = useRef(null);
	const inputRef = useRef(null);

	const selectedVendor = vendors.find((v) => v.contact_id === value);

	const filtered = search.trim()
		? vendors.filter((v) =>
				v.contact_name.toLowerCase().includes(search.toLowerCase()),
			)
		: vendors;

	useEffect(() => {
		function handleClickOutside(e) {
			if (containerRef.current && !containerRef.current.contains(e.target)) {
				setOpen(false);
			}
		}
		document.addEventListener('mousedown', handleClickOutside);
		return () => document.removeEventListener('mousedown', handleClickOutside);
	}, []);

	const handleOpen = () => {
		setOpen(true);
		setTimeout(() => inputRef.current?.focus(), 50);
	};

	return (
		<div ref={containerRef} className="relative">
			{/* Trigger */}
			<div
				onClick={handleOpen}
				className="flex items-center justify-between border border-gray-200 rounded-lg px-3 py-2 bg-white cursor-pointer hover:border-blue-300 transition-colors select-none">
				<span
					className={`text-xs ${selectedVendor ? 'text-gray-800' : 'text-gray-400'}`}>
					{loading
						? 'Loading vendors…'
						: selectedVendor
							? selectedVendor.contact_name
							: 'Search and select a vendor…'}
				</span>
				<svg
					className={`w-3 h-3 text-gray-400 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
					viewBox="0 0 12 12"
					fill="none">
					<path
						d="M2 4l4 4 4-4"
						stroke="currentColor"
						strokeWidth="1.5"
						strokeLinecap="round"
						strokeLinejoin="round"
					/>
				</svg>
			</div>

			{/* Dropdown */}
			{open && !loading && (
				<div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
					{/* Search input */}
					<div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100">
						<svg
							className="w-3 h-3 text-gray-400 flex-shrink-0"
							viewBox="0 0 16 16"
							fill="none">
							<circle
								cx="6.5"
								cy="6.5"
								r="5"
								stroke="currentColor"
								strokeWidth="1.5"
							/>
							<path
								d="M10.5 10.5L14 14"
								stroke="currentColor"
								strokeWidth="1.5"
								strokeLinecap="round"
							/>
						</svg>
						<input
							ref={inputRef}
							type="text"
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							placeholder="Search vendors…"
							className="flex-1 text-xs text-gray-700 outline-none bg-transparent placeholder-gray-400"
							onClick={(e) => e.stopPropagation()}
						/>
						{search && (
							<button
								onClick={() => setSearch('')}
								className="text-gray-400 hover:text-gray-600 text-xs leading-none">
								✕
							</button>
						)}
					</div>

					{/* List */}
					<ul className="max-h-52 overflow-y-auto">
						{filtered.length === 0 ? (
							<li className="px-3 py-3 text-xs text-gray-400 text-center">
								No vendors match "{search}"
							</li>
						) : (
							filtered.map((v) => (
								<li
									key={v.contact_id}
									onClick={() => {
										onChange(v.contact_id);
										setOpen(false);
										setSearch('');
									}}
									className={`px-3 py-2 text-xs cursor-pointer transition-colors ${
										v.contact_id === value
											? 'bg-blue-50 text-blue-600 font-medium'
											: 'text-gray-700 hover:bg-gray-50'
									}`}>
									{v.contact_name}
								</li>
							))
						)}
					</ul>
				</div>
			)}
		</div>
	);
}
