import { useState, useEffect } from 'react';
import { getContactDetails } from './ZohoAPI';

/**
 * Read-back panel for a selected Zoho contact — vendor or customer alike.
 * Shows display and company name, billing/shipping addresses, phone, email and
 * GST, mirroring what Zoho Books shows on its own forms.
 *
 * The list endpoints omit addresses and GST, so this fetches the full contact
 * record. Results are cached per session in ZohoAPI.
 */
export default function ContactDetails({ contactId, showShipping = true }) {
	const [contact, setContact] = useState(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState(null);

	useEffect(() => {
		if (!contactId) {
			setContact(null);
			return undefined;
		}
		let cancelled = false;
		setLoading(true);
		setError(null);
		getContactDetails(contactId)
			.then((c) => !cancelled && setContact(c))
			.catch(() => !cancelled && setError('Could not load contact details.'))
			.finally(() => !cancelled && setLoading(false));
		return () => {
			cancelled = true;
		};
	}, [contactId]);

	if (!contactId) return null;

	if (loading) {
		return (
			<div className="mt-3 text-[12px] text-muted">Loading details…</div>
		);
	}
	if (error) {
		return <div className="mt-3 text-[12px] text-danger">{error}</div>;
	}
	if (!contact) return null;

	const billing = contact.billing_address || {};
	const shipping = contact.shipping_address || {};
	const phone =
		contact.phone || contact.mobile || billing.phone || shipping.phone;

	// Zoho keeps the person's display name separate from the trading name.
	const companyName =
		contact.company_name && contact.company_name !== contact.contact_name
			? contact.company_name
			: null;

	return (
		<div className="mt-3 border-t border-line-4 pt-3">
			<div className="text-[13px] font-bold text-body">
				{contact.contact_name}
			</div>
			{companyName && (
				<div className="text-[12.5px] text-body-3 mt-0.5">{companyName}</div>
			)}

			<div
				className={`grid gap-5 mt-3 ${showShipping ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
				<AddressBlock title="BILLING ADDRESS" address={billing} />
				{showShipping && (
					<AddressBlock
						title="SHIPPING ADDRESS"
						address={shipping}
						fallback={billing}
					/>
				)}
			</div>

			<div className="mt-3 flex flex-col gap-1">
				<Line label="Phone" value={phone} mono />
				<Line label="Email" value={contact.email} />
				<Line
					label="GST Treatment"
					value={
						contact.gst_treatment
							? formatGstTreatment(contact.gst_treatment)
							: null
					}
				/>
				<Line label="GSTIN" value={contact.gst_no} mono />
				<Line label="PAN" value={contact.pan_no} mono />
				<Line label="Place of supply" value={contact.place_of_contact} />
			</div>
		</div>
	);
}

function Line({ label, value, mono }) {
	if (!value) return null;
	return (
		<div className="text-[12.5px] text-body-3">
			<span className="text-muted">{label}: </span>
			<span className={mono ? 'num' : undefined}>{value}</span>
		</div>
	);
}

function AddressBlock({ title, address, fallback }) {
	const a = hasAny(address) ? address : fallback;
	return (
		<div>
			<div className="text-[10.5px] font-bold text-muted tracking-[.04em] mb-1.5">
				{title}
			</div>
			{!hasAny(a) ? (
				<div className="text-[12.5px] text-muted-2">Not set in Zoho.</div>
			) : (
				<div className="text-[12.5px] text-body-3 leading-[1.55]">
					{[
						a.attention,
						a.address,
						a.street2,
						a.city,
						[a.state, a.zip].filter(Boolean).join(' '),
						a.country,
					]
						.filter(Boolean)
						.map((lineText, i) => (
							<div key={i}>{lineText}</div>
						))}
				</div>
			)}
		</div>
	);
}

function hasAny(a) {
	if (!a) return false;
	return !!(
		a.attention ||
		a.address ||
		a.street2 ||
		a.city ||
		a.state ||
		a.zip ||
		a.country
	);
}

// Zoho returns these as snake_case tokens, e.g. "business_gst".
function formatGstTreatment(t) {
	const map = {
		business_gst: 'Registered Business — Regular',
		business_none: 'Unregistered Business',
		overseas: 'Overseas',
		consumer: 'Consumer',
		sez: 'SEZ',
		deemed_export: 'Deemed Export',
		business_sez: 'SEZ Developer',
		sez_developer: 'SEZ Developer',
		tax_deductor: 'Tax Deductor',
		composition: 'Registered Business — Composition',
	};
	return map[t] || t.replace(/_/g, ' ');
}
