import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import AppShell from './components/AppShell';
import ZohoItemTable from './components/ZohoItemTable';
import NewPOPage from './pages/NewPOPage';
import LostSalesListPage from './pages/LostSalesListPage';
import LostSaleFormPage from './pages/LostSaleFormPage';
import ReorderSuggestionsPage from './pages/ReorderSuggestionsPage';

// === AUTH CONSTANTS ===
const ZOHO_CLIENT_ID = process.env.REACT_APP_ZOHO_CLIENT_ID;
const ZOHO_REDIRECT_URI = process.env.REACT_APP_ZOHO_REDIRECT_URI;
const ZOHO_SCOPE = 'ZohoBooks.fullaccess.all';
const ZOHO_AUTH_URL = 'https://accounts.zoho.in/oauth/v2/auth';
const TOKEN_CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes

// === UTILITY FUNCTIONS ===
const getZohoLoginUrl = (prompt = 'consent') => {
	return `${ZOHO_AUTH_URL}?scope=${ZOHO_SCOPE}&client_id=${ZOHO_CLIENT_ID}&response_type=token&redirect_uri=${encodeURIComponent(
		ZOHO_REDIRECT_URI,
	)}&access_type=offline&prompt=${prompt}`;
};

const isTokenExpired = () => {
	const expiresAt = Number(localStorage.getItem('expiresAt'));
	return !expiresAt || Date.now() > expiresAt;
};

const clearTokens = () => {
	localStorage.removeItem('accessToken');
	localStorage.removeItem('expiresAt');
};

// Export logout function for use in other files
export const logout = () => {
	clearTokens();
	window.location.assign(ZOHO_REDIRECT_URI);
};

const storeTokens = (accessToken, expiresIn) => {
	const expiresAt = Date.now() + Number(expiresIn) * 1000;
	localStorage.setItem('accessToken', accessToken);
	localStorage.setItem('expiresAt', expiresAt.toString());
};

// What the app does, said once on the only screen a new user sees before
// anything is loaded.
const LOGIN_POINTS = [
	'See every item at or below its reorder point, grouped by vendor',
	'Raise a draft purchase order from a selection in two clicks',
	'Log the demand Zoho never sees, and let it move your reorder points',
];

function App() {
	const [isAuthenticated, setIsAuthenticated] = useState(false);

	useEffect(() => {
		// Handle OAuth redirect with access token
		const handleOAuthRedirect = () => {
			let hash = window.location.hash;
			if (hash.startsWith('#/')) {
				hash = '#' + hash.slice(2);
			}

			const hashParams = new URLSearchParams(hash.slice(1));
			const accessToken = hashParams.get('access_token');
			const expiresIn = hashParams.get('expires_in');

			if (accessToken && expiresIn) {
				storeTokens(accessToken, expiresIn);
				setIsAuthenticated(true);
				// Clean up URL
				window.location.replace(
					window.location.pathname + window.location.search,
				);
				return true;
			}
			return false;
		};

		// Check existing token validity
		const checkExistingToken = () => {
			const storedToken = localStorage.getItem('accessToken');

			if (storedToken && !isTokenExpired()) {
				setIsAuthenticated(true);
			} else if (storedToken && isTokenExpired()) {
				// Token expired, try silent refresh
				window.location.assign(getZohoLoginUrl('none'));
			}
		};

		// Set up token expiry monitoring
		const setupTokenMonitoring = () => {
			const interval = setInterval(() => {
				if (isTokenExpired() && localStorage.getItem('accessToken')) {
					window.location.assign(getZohoLoginUrl('none'));
				}
			}, TOKEN_CHECK_INTERVAL);

			return () => clearInterval(interval);
		};

		// Execute initialization logic
		const isRedirectHandled = handleOAuthRedirect();
		if (!isRedirectHandled) {
			checkExistingToken();
		}

		const cleanup = setupTokenMonitoring();
		return cleanup;
	}, []);

	const handleLogin = () => {
		window.location.assign(getZohoLoginUrl('consent'));
	};


	// Auth gating is unchanged: unauthenticated users get the Zoho login button
	// on every route.
	if (!isAuthenticated) {
		return (
			<div className="min-h-screen flex items-center justify-center p-6">
				<div className="w-full max-w-[420px] bg-surface border border-line rounded-2xl shadow-float p-8 animate-fade-up">
					<div className="flex items-center gap-3 mb-7">
						<div className="w-11 h-11 rounded-[13px] bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white font-black text-[20px] shadow-card">
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

					<ul className="list-none p-0 m-0 mb-7 flex flex-col gap-3">
						{LOGIN_POINTS.map((point) => (
							<li key={point} className="flex items-start gap-2.5">
								<span className="w-[18px] h-[18px] rounded-full bg-brand-50 border border-brand-100 flex items-center justify-center flex-shrink-0 mt-px">
									<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#2f7be0" strokeWidth="3.4">
										<path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
									</svg>
								</span>
								<span className="text-[13px] text-body-2 leading-[1.5]">
									{point}
								</span>
							</li>
						))}
					</ul>

					<button
						onClick={handleLogin}
						className="w-full h-11 rounded-xl border-none bg-gradient-to-b from-brand-400 to-brand-600 text-white font-black text-[14px] cursor-pointer shadow-card hover:shadow-card-hover hover:-translate-y-px transition-all duration-200 ease-smooth flex items-center justify-center gap-2">
						Continue with Zoho
						<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
							<path d="M5 12h14M13 6l6 6-6 6" />
						</svg>
					</button>

					<p className="text-[11.5px] text-muted-2 text-center mt-4 mb-0 leading-relaxed">
						You will be sent to Zoho to sign in. Nothing is stored here beyond
						the session token.
					</p>
				</div>
			</div>
		);
	}

	// BrowserRouter, not HashRouter — the OAuth implicit grant already parses
	// window.location.hash for the access token and a hash router would collide
	// with it. Needs the SPA rewrite in netlify.toml to survive a refresh.
	return (
		<BrowserRouter>
			<Routes>
				<Route element={<AppShell />}>
					<Route path="/" element={<ZohoItemTable />} />
					<Route path="/po/new" element={<NewPOPage />} />
					<Route path="/lost-sales" element={<LostSalesListPage />} />
					<Route path="/lost-sales/new" element={<LostSaleFormPage />} />
					<Route
						path="/lost-sales/:id/edit"
						element={<LostSaleFormPage />}
					/>
					<Route
						path="/reorder-suggestions"
						element={<ReorderSuggestionsPage />}
					/>
					<Route path="*" element={<Navigate to="/" replace />} />
				</Route>
			</Routes>
		</BrowserRouter>
	);
}

export default App;
