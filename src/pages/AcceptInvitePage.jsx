import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { acceptInvite } from '../lib/api';
import { useAuth } from '../lib/auth';

/**
 * Setting a password against an invitation.
 *
 * Reachable without a session — it is how an invited person gets one. The
 * token arrives in the query string; only its hash is stored server-side, so
 * this link is the one moment the raw token exists.
 */
export default function AcceptInvitePage() {
	const [params] = useSearchParams();
	const navigate = useNavigate();
	const { refresh } = useAuth();

	const token = useMemo(() => params.get('token') ?? '', [params]);

	const [password, setPassword] = useState('');
	const [confirm, setConfirm] = useState('');
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState(null);

	const submit = async (event) => {
		event.preventDefault();
		if (busy) return;
		if (password !== confirm) {
			setError('Those two passwords do not match.');
			return;
		}
		setBusy(true);
		setError(null);
		try {
			await acceptInvite(token, password);
			// Accepting signs you in, so land on the app rather than the login form.
			await refresh();
			navigate('/', { replace: true });
		} catch (e) {
			setError(e.message || 'Could not set your password.');
			setBusy(false);
		}
	};

	const field =
		'w-full h-9 border border-line-2 rounded px-3 text-[13.5px] bg-surface text-body outline-none transition-colors focus:border-muted-3';

	return (
		<div className="min-h-screen flex items-center justify-center p-6">
			<form
				onSubmit={submit}
				className="w-full max-w-[400px] bg-surface border border-line rounded shadow-float p-8 animate-fade-up">
				<div className="text-[17px] font-black text-heading tracking-[-.01em] mb-1">
					Set your password
				</div>
				<p className="text-[13px] text-muted-2 mt-0 mb-6 leading-relaxed">
					Choose a password of at least 12 characters, using three of:
					lowercase, uppercase, digits, symbols.
				</p>

				{token === '' && (
					<div
						role="alert"
						className="mb-4 px-3 py-2.5 rounded border bg-danger-bg border-danger-border text-danger text-[12.5px] font-bold">
						This link has no invitation token in it. Ask for a new invitation.
					</div>
				)}

				<label className="block mb-3.5">
					<span className="block text-[12.5px] font-bold text-body-2 mb-1.5">
						New password
					</span>
					<input
						type="password"
						autoComplete="new-password"
						required
						value={password}
						onChange={(e) => setPassword(e.target.value)}
						className={field}
					/>
				</label>

				<label className="block mb-5">
					<span className="block text-[12.5px] font-bold text-body-2 mb-1.5">
						Confirm password
					</span>
					<input
						type="password"
						autoComplete="new-password"
						required
						value={confirm}
						onChange={(e) => setConfirm(e.target.value)}
						className={field}
					/>
				</label>

				{error && (
					<div
						role="alert"
						className="mb-4 px-3 py-2.5 rounded border bg-danger-bg border-danger-border text-danger text-[12.5px] font-bold animate-fade-in">
						{error}
					</div>
				)}

				<button
					type="submit"
					disabled={busy || token === ''}
					className="w-full h-10 rounded border border-brand bg-brand hover:bg-brand-600 text-white font-black text-[13.5px] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
					{busy ? 'Saving…' : 'Set password and sign in'}
				</button>
			</form>
		</div>
	);
}
