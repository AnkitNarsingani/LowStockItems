/**
 * Zoho OAuth token management — the server side of the migration.
 *
 * The refresh token never leaves the server. Access tokens are cached in
 * module scope (warm-instance memory) and refreshed slightly before expiry,
 * and a single in-flight promise is shared so a burst of concurrent requests
 * causes one refresh rather than a stampede.
 *
 * This replaces the browser's implicit grant. Previously the frontend held a
 * `ZohoBooks.fullaccess.all` access token in localStorage and called Zoho
 * directly; any script on the page could read it and there was no way to
 * revoke one session.
 */

import { queryOne, query } from '../db.mjs';
import { decryptSecret, encryptSecret } from '../crypto.mjs';
import { ZohoAuthenticationError, ZohoNotConfiguredError } from '../errors.mjs';

/**
 * This app creates purchase orders, so unlike a read-only integration it needs
 * write scope. Kept as one constant so what we ask for is stated in exactly
 * one place and can be narrowed later without hunting through call sites.
 */
export const REQUIRED_SCOPES = ['ZohoBooks.fullaccess.all'];
export const scopeString = () => REQUIRED_SCOPES.join(',');

/** Data centre → API domain. Never hardcode the US domain. */
const API_DOMAIN_BY_HOST = {
	'accounts.zoho.in': 'https://www.zohoapis.in',
	'accounts.zoho.com': 'https://www.zohoapis.com',
	'accounts.zoho.eu': 'https://www.zohoapis.eu',
	'accounts.zoho.com.au': 'https://www.zohoapis.com.au',
	'accounts.zoho.jp': 'https://www.zohoapis.jp',
	'accounts.zohocloud.ca': 'https://www.zohoapis.ca',
	'accounts.zoho.sa': 'https://www.zohoapis.sa',
};

export function accountsDomain() {
	return (
		process.env.ZOHO_ACCOUNTS_DOMAIN ?? 'https://accounts.zoho.in'
	).replace(/\/+$/, '');
}

export function inferApiDomain(domain = accountsDomain()) {
	try {
		return (
			API_DOMAIN_BY_HOST[new URL(domain).hostname.toLowerCase()] ??
			'https://www.zohoapis.in'
		);
	} catch {
		return 'https://www.zohoapis.in';
	}
}

export const apiDomain = () =>
	(process.env.ZOHO_API_DOMAIN || inferApiDomain()).replace(/\/+$/, '');

export const organizationId = () => process.env.ZOHO_ORGANIZATION_ID ?? '';

/* ------------------------------------------------------- refresh token IO */

/**
 * The refresh token comes from the environment when one is configured, and
 * otherwise from the row the in-app connect flow writes. The environment wins:
 * it is the easier one to rotate in an incident.
 */
export async function readRefreshToken() {
	const fromEnv = process.env.ZOHO_REFRESH_TOKEN;
	if (fromEnv) return fromEnv;

	const row = await queryOne(
		'SELECT refresh_token_encrypted FROM zoho_connection WHERE id = 1',
	);
	if (!row?.refresh_token_encrypted) return null;

	try {
		return decryptSecret(row.refresh_token_encrypted);
	} catch {
		// A key rotation invalidates the stored token; say so rather than
		// failing later with an opaque Zoho error.
		throw new ZohoNotConfiguredError(
			'The stored Zoho token could not be read. Reconnect Zoho.',
		);
	}
}

export async function storeRefreshToken(token, connectedBy) {
	await query(
		`INSERT INTO zoho_connection (id, refresh_token_encrypted, refresh_token_updated_at, connected_by, connected_at)
		 VALUES (1, $1, NOW(), $2, NOW())
		 ON CONFLICT (id) DO UPDATE
		   SET refresh_token_encrypted = EXCLUDED.refresh_token_encrypted,
		       refresh_token_updated_at = NOW(),
		       connected_by = EXCLUDED.connected_by,
		       connected_at = NOW()`,
		[encryptSecret(token), connectedBy ?? null],
	);
	invalidateAccessToken();
}

export async function clearRefreshToken() {
	await query(
		`UPDATE zoho_connection
		    SET refresh_token_encrypted = NULL, refresh_token_updated_at = NOW()
		  WHERE id = 1`,
	);
	invalidateAccessToken();
}

/* --------------------------------------------------------- access tokens */

let cached = null; // { token, expiresAt }
let inFlight = null;

export function invalidateAccessToken() {
	cached = null;
	inFlight = null;
}

// Refresh a minute early so a token cannot expire mid-request.
const EXPIRY_MARGIN_MS = 60_000;

async function requestAccessToken(refreshToken) {
	const clientId = process.env.ZOHO_CLIENT_ID;
	const clientSecret = process.env.ZOHO_CLIENT_SECRET;
	if (!clientId || !clientSecret) {
		throw new ZohoNotConfiguredError(
			'ZOHO_CLIENT_ID and ZOHO_CLIENT_SECRET are not set on the server.',
		);
	}

	const body = new URLSearchParams({
		refresh_token: refreshToken,
		client_id: clientId,
		client_secret: clientSecret,
		grant_type: 'refresh_token',
	});

	const response = await fetch(`${accountsDomain()}/oauth/v2/token`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body,
	});

	const payload = await response.json().catch(() => ({}));

	// Zoho reports OAuth failures with HTTP 200 and an `error` field, so the
	// status alone is not enough to tell success from failure.
	if (!response.ok || payload.error || !payload.access_token) {
		throw new ZohoAuthenticationError(
			payload.error === 'invalid_code' || payload.error === 'invalid_grant'
				? 'Zoho rejected the stored refresh token. Reconnect Zoho.'
				: `Zoho refused the token request${payload.error ? ` (${payload.error})` : ''}.`,
		);
	}

	return {
		token: payload.access_token,
		expiresAt: Date.now() + Number(payload.expires_in ?? 3600) * 1000,
	};
}

/** A valid access token, refreshing at most once across concurrent callers. */
export async function getAccessToken() {
	if (cached && cached.expiresAt - EXPIRY_MARGIN_MS > Date.now()) {
		return cached.token;
	}
	if (inFlight) return inFlight;

	inFlight = (async () => {
		const refreshToken = await readRefreshToken();
		if (!refreshToken) {
			throw new ZohoNotConfiguredError();
		}
		const fresh = await requestAccessToken(refreshToken);
		cached = fresh;
		return fresh.token;
	})();

	try {
		return await inFlight;
	} finally {
		inFlight = null;
	}
}

/* ------------------------------------------------------------ OAuth flow */

export function buildAuthorizationUrl({ redirectUri, state }) {
	const clientId = process.env.ZOHO_CLIENT_ID;
	if (!clientId) throw new ZohoNotConfiguredError('ZOHO_CLIENT_ID is not set.');

	const params = new URLSearchParams({
		scope: scopeString(),
		client_id: clientId,
		response_type: 'code',
		redirect_uri: redirectUri,
		// Both are required for Zoho to return a refresh token at all.
		access_type: 'offline',
		prompt: 'consent',
		state,
	});
	return `${accountsDomain()}/oauth/v2/auth?${params.toString()}`;
}

export async function exchangeAuthorizationCode({ code, redirectUri }) {
	const clientId = process.env.ZOHO_CLIENT_ID;
	const clientSecret = process.env.ZOHO_CLIENT_SECRET;
	if (!clientId || !clientSecret) {
		throw new ZohoNotConfiguredError(
			'ZOHO_CLIENT_ID and ZOHO_CLIENT_SECRET are not set on the server.',
		);
	}

	const response = await fetch(`${accountsDomain()}/oauth/v2/token`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			code,
			client_id: clientId,
			client_secret: clientSecret,
			redirect_uri: redirectUri,
			grant_type: 'authorization_code',
		}),
	});

	const payload = await response.json().catch(() => ({}));
	if (!response.ok || payload.error || !payload.refresh_token) {
		throw new ZohoAuthenticationError(
			payload.error === 'invalid_code'
				? 'That authorization code was already used or has expired. Try connecting again.'
				: `Zoho did not return a refresh token${payload.error ? ` (${payload.error})` : ''}. The client must be a Server-based Application.`,
		);
	}

	return {
		refreshToken: payload.refresh_token,
		apiDomain: payload.api_domain ?? null,
	};
}

/** Connection health, with nothing secret in it. */
export async function connectionStatus() {
	const hasClient = Boolean(
		process.env.ZOHO_CLIENT_ID && process.env.ZOHO_CLIENT_SECRET,
	);
	const row = await queryOne(
		'SELECT connected_at, connected_by, refresh_token_updated_at FROM zoho_connection WHERE id = 1',
	);
	const fromEnv = Boolean(process.env.ZOHO_REFRESH_TOKEN);

	return {
		clientConfigured: hasClient,
		connected: fromEnv || Boolean(row?.refresh_token_updated_at),
		source: fromEnv ? 'environment' : row?.refresh_token_updated_at ? 'in-app' : null,
		connectedAt: row?.connected_at ?? null,
		organizationId: organizationId() || null,
		apiDomain: apiDomain(),
	};
}
