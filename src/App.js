import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import './App.css';
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

// === STYLES ===
const styles = {
	loginContainer: {
		marginTop: 60,
	},
	loginButton: {
		background: '#408DFB',
		color: '#fff',
		fontSize: 18,
		padding: '16px 24px',
		border: 'none',
		borderRadius: 4,
		cursor: 'pointer',
	},
};

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
			<div className="App">
				<div style={styles.loginContainer}>
					<button onClick={handleLogin} style={styles.loginButton}>
						Login with Zoho
					</button>
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
