import { useState } from 'react';
import { useAuth } from '../lib/auth';

/**
 * The sign-in screen.
 *
 * There is no "sign up": accounts exist because an administrator created one.
 * The failure message is deliberately the same whether the email is unknown or
 * the password is wrong — the server answers identically too, so the screen
 * does not leak what the API is careful not to.
 */
export default function LoginPage() {
	const { signIn } = useAuth();

	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState(null);

	const submit = async (event) => {
		event.preventDefault();
		if (busy) return;
		setBusy(true);
		setError(null);
		try {
			await signIn(email.trim(), password);
		} catch (e) {
			setError(e.message || 'Could not sign you in.');
			setBusy(false);
		}
	};

	return (
		<div className="min-h-screen flex items-center justify-center p-6">
			<form
				onSubmit={submit}
				className="w-full max-w-[400px] bg-surface border border-line rounded shadow-float p-8 animate-fade-up">
				<div className="flex items-center gap-3 mb-7">
					<div className="w-11 h-11 rounded bg-brand flex items-center justify-center text-white font-black text-[20px]">
						L
					</div>
					<div>
						<div className="font-black text-[18px] text-heading tracking-[-.02em] leading-tight">
							Low<span className="text-brand-600">Stock</span>Items
						</div>
						<div className="text-[12.5px] text-muted-2">
							Purchasing, on top of Zoho Books
						</div>
					</div>
				</div>

				<label className="block mb-3.5">
					<span className="block text-[12.5px] font-bold text-body-2 mb-1.5">
						Email
					</span>
					<input
						type="email"
						autoComplete="username"
						autoFocus
						required
						value={email}
						onChange={(e) => setEmail(e.target.value)}
						className="w-full h-9 border border-line-2 rounded px-3 text-[13.5px] bg-surface text-body outline-none transition-colors focus:border-muted-3"
					/>
				</label>

				<label className="block mb-5">
					<span className="block text-[12.5px] font-bold text-body-2 mb-1.5">
						Password
					</span>
					<input
						type="password"
						autoComplete="current-password"
						required
						value={password}
						onChange={(e) => setPassword(e.target.value)}
						className="w-full h-9 border border-line-2 rounded px-3 text-[13.5px] bg-surface text-body outline-none transition-colors focus:border-muted-3"
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
					disabled={busy}
					className="w-full h-10 rounded border border-brand bg-brand hover:bg-brand-600 text-white font-black text-[13.5px] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors">
					{busy && (
						<span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
					)}
					{busy ? 'Signing in…' : 'Sign in'}
				</button>

				<p className="text-[11.5px] text-muted-2 text-center mt-4 mb-0 leading-relaxed">
					Accounts are created by an administrator. If you need access, ask for
					an invitation.
				</p>
			</form>
		</div>
	);
}
