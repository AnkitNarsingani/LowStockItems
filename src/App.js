import './App.css';
import ZohoItemTable from './components/ZohoItemTable';
import React, { useState, useEffect } from 'react';
import { HashRouter, Routes, Route, useNavigate } from 'react-router-dom';

// === AUTH CONSTANTS ===
const ZOHO_CLIENT_ID = '1000.P3A9MPXVHA3M62ASDTE9B5CDBLITVW';
const ZOHO_REDIRECT_URI = 'https://ankitnarsingani.github.io/LowStockItems/'; // Your GitHub Pages URL!
const ZOHO_SCOPE = 'ZohoBooks.fullaccess.all';
const ZOHO_AUTH_URL = 'https://accounts.zoho.in/oauth/v2/auth';

function getZohoLoginUrl() {
	return `${ZOHO_AUTH_URL}?scope=${ZOHO_SCOPE}&client_id=${ZOHO_CLIENT_ID}&response_type=token&redirect_uri=${encodeURIComponent(
		ZOHO_REDIRECT_URI
	)}&access_type=offline&prompt=consent`;
}

// Component that handles login and redirect
function AuthLanding() {
	const [isAuthenticated, setIsAuthenticated] = useState(false);
	const navigate = useNavigate();

	useEffect(() => {
		const hashParams = new URLSearchParams(window.location.hash.slice(1));
		const accessToken = hashParams.get('access_token');
		const expiresIn = hashParams.get('expires_in');

		if (accessToken && expiresIn) {
			localStorage.setItem('accessToken', accessToken);
			localStorage.setItem(
				'expiresIn',
				new Date(Date.now() + Number(expiresIn) * 1000).toString()
			);
			setIsAuthenticated(true);
			window.location.hash = '';
			// Delay navigation slightly to let hash clear
			setTimeout(() => navigate('/items', { replace: true }), 50);
		} else if (
			localStorage.getItem('accessToken') &&
			localStorage.getItem('expiresIn') &&
			new Date() <= new Date(localStorage.getItem('expiresIn'))
		) {
			setIsAuthenticated(true);
			setTimeout(() => navigate('/items', { replace: true }), 0);
		}
	}, [navigate]);

	const handleLogin = () => {
		window.location.assign(getZohoLoginUrl());
	};

	return (
		<div className="App">
			<div style={{ marginTop: 60 }}>
				<button
					onClick={handleLogin}
					style={{
						background: '#408DFB',
						color: '#fff',
						fontSize: 18,
						padding: '16px 24px',
						border: 'none',
						borderRadius: 4,
						cursor: 'pointer',
					}}>
					Login with Zoho
				</button>
			</div>
		</div>
	);
}

// Page for items table and logout
function ItemsPage() {
	const handleLogout = () => {
		localStorage.removeItem('accessToken');
		localStorage.removeItem('expiresIn');
		window.location.assign('/');
	};

	return (
		<>
			<div style={{ float: 'right', margin: 8 }}>
				<button onClick={handleLogout}>Logout</button>
			</div>
			<ZohoItemTable />
		</>
	);
}

function App() {
	return (
		<HashRouter>
			<Routes>
				<Route path="/" element={<AuthLanding />} />
				<Route path="/items" element={<ItemsPage />} />
			</Routes>
		</HashRouter>
	);
}

export default App;
