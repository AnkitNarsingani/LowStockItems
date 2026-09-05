/**
 * Who is signed in.
 *
 * The session lives in an httpOnly cookie, which JavaScript cannot read by
 * design — so "am I signed in?" is answered by asking the server (`/api/me`)
 * rather than by inspecting storage. That one round trip on load is the price
 * of the browser no longer holding a credential.
 */

import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
} from 'react';
import {
	fetchMe,
	isAuthError,
	login as loginRequest,
	logoutRequest,
} from './api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
	const [user, setUser] = useState(null);
	// 'loading' until the first /api/me settles, so the app never flashes the
	// login screen at someone who is already signed in.
	const [phase, setPhase] = useState('loading');
	const [error, setError] = useState(null);

	const refresh = useCallback(async () => {
		try {
			const data = await fetchMe();
			setUser(data.user);
			setPhase('authenticated');
			return data.user;
		} catch (e) {
			setUser(null);
			// Anything that is not "you are signed out" is worth surfacing: a
			// misconfigured database should not look like a login prompt.
			setPhase(isAuthError(e) ? 'anonymous' : 'error');
			if (!isAuthError(e)) setError(e.message);
			return null;
		}
	}, []);

	useEffect(() => {
		refresh();
	}, [refresh]);

	const signIn = useCallback(async (email, password) => {
		const data = await loginRequest(email, password);
		setUser(data.user);
		setPhase('authenticated');
		setError(null);
		return data.user;
	}, []);

	const signOut = useCallback(async () => {
		try {
			await logoutRequest();
		} finally {
			// Whatever the server said, this browser is done with the session.
			setUser(null);
			setPhase('anonymous');
		}
	}, []);

	const value = useMemo(
		() => ({ user, phase, error, signIn, signOut, refresh }),
		[user, phase, error, signIn, signOut, refresh],
	);

	return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
	const context = useContext(AuthContext);
	if (context === null) {
		throw new Error('useAuth must be used inside an AuthProvider.');
	}
	return context;
}
