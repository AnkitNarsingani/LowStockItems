import React, { useState, useEffect } from 'react';
import './App.css';
import ZohoItemTable from './components/ZohoItemTable';

// === AUTH CONSTANTS ===
const ZOHO_CLIENT_ID = '1000.P3A9MPXVHA3M62ASDTE9B5CDBLITVW';
const ZOHO_REDIRECT_URI = 'https://ankitnarsingani.github.io/LowStockItems/';
const ZOHO_SCOPE = 'ZohoBooks.fullaccess.all';
const ZOHO_AUTH_URL = 'https://accounts.zoho.in/oauth/v2/auth';
const TOKEN_CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes

// === UTILITY FUNCTIONS ===
const getZohoLoginUrl = (prompt = 'consent') => {
	return `${ZOHO_AUTH_URL}?scope=${ZOHO_SCOPE}&client_id=${ZOHO_CLIENT_ID}&response_type=token&redirect_uri=${encodeURIComponent(
		ZOHO_REDIRECT_URI
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
					window.location.pathname + window.location.search
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

	const handleLogout = () => {
		clearTokens();
		setIsAuthenticated(false);
		window.location.assign(ZOHO_REDIRECT_URI);
	};

	return (
		<div className="App">
			{!isAuthenticated ? (
				<div style={styles.loginContainer}>
					<button onClick={handleLogin} style={styles.loginButton}>
						Login with Zoho
					</button>
				</div>
			) : (
				<ZohoItemTable />
			)}
		</div>
	);
}

export default App;
