/**
 * Zoho OAuth token management — the server side of the migration.
 *
 * The refresh token never leaves the server. Access tokens are held in module
 * scope (warm-instance memory) and refreshed slightly before expiry, and
 * concurrent callers share one in-flight refresh so N parallel requests
 * produce one token call rather than N.
 *
 * The access token is deliberately NOT persisted. It is short-lived and
 * re-obtainable at any time from the refresh token, so writing it down would
 * add a second long-lived secret at rest to save one HTTP call per cold start.
 * The refresh token is the thing worth protecting, and it is the only one
 * stored.
 *
 * This replaces the browser's implicit grant, under which the frontend held a
 * ZohoBooks.fullaccess.all access token in localStorage — readable by any
 * script on the page, with no way to revoke a single session.
 */

import { queryOne, query } from '../db.mjs';
import { decryptSecret, encryptSecret } from '../crypto.mjs';
import { ZohoAuthenticationError, ZohoNotConfiguredError } from '../errors.mjs';

/**
 * This app creates purchase orders, so unlike a read-only integration it needs
 * write scope. Stated in one place so what we ask for can be narrowed later
 * without hunting through call sites.
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

const trim = (value) => String(value ?? '').replace(/\/+$/, '');

export function inferApiDomain(domain) {
	try {
		return (
			API_DOMAIN_BY_HOST[new URL(domain).hostname.toLowerCase()] ??
			'https://www.zohoapis.in'
		);
	} catch {
		return 'https://www.zohoapis.in';
	}
}

export const defaultAccountsDomain = () =>
	trim(process.env.ZOHO_ACCOUNTS_DOMAIN) || 'https://accounts.zoho.in';

/* --------------------------------------------------------- stored connection */

/** Reads and decrypts the stored connection. Server-only. */
async function loadStoredConnection() {
	const row = await queryOne(
		`SELECT refresh_token_encrypted, organization_id, accounts_domain, api_domain
		   FROM zoho_connection WHERE id = 1`,
	);
	if (row === null) return null;

	let refreshToken = null;
	if (row.refresh_token_encrypted) {
		try {
			refreshToken = decryptSecret(row.refresh_token_encrypted);
		} catch {
			// A rotated key makes the stored token unreadable. Say so plainly
			// rather than failing later inside an opaque Zoho error.
			throw new ZohoNotConfiguredError(
				'The stored Zoho token could not be decrypted. Reconnect Zoho.',
			);
		}
	}

	return {
		refreshToken,
		organizationId: row.organization_id,
		accountsDomain: row.accounts_domain,
		apiDomain: row.api_domain,
	};
}

/**
 * Everything needed to talk to Zoho, or null when not configured.
 *
 * ZOHO_REFRESH_TOKEN always wins when present: an environment variable is the
 * easier thing to rotate in an incident. Otherwise the connection captured by
 * the in-app OAuth flow is used, including the organization and domains Zoho
 * itself reported — so an in-app connection does not also require someone to
 * set matching environment variables.
 */
export async function resolveCredentials() {
	const clientId = process.env.ZOHO_CLIENT_ID;
	const clientSecret = process.env.ZOHO_CLIENT_SECRET;
	if (!clientId || !clientSecret) return null;

	const envRefreshToken = process.env.ZOHO_REFRESH_TOKEN;
	const stored = envRefreshToken ? null : await loadStoredConnection();

	const refreshToken = envRefreshToken || stored?.refreshToken;
	if (!refreshToken) return null;

	const organizationId =
		process.env.ZOHO_ORGANIZATION_ID || stored?.organizationId || null;
	if (!organizationId) return null;

	const accountsDomain =
		trim(process.env.ZOHO_ACCOUNTS_DOMAIN) ||
		trim(stored?.accountsDomain) ||
		'https://accounts.zoho.in';

	return {
		clientId,
		clientSecret,
		refreshToken,
		accountsDomain,
		apiDomain:
			trim(process.env.ZOHO_API_DOMAIN) ||
			trim(stored?.apiDomain) ||
			inferApiDomain(accountsDomain),
		organizationId,
	};
}

export async function requireResolvedCredentials() {
	const credentials = await resolveCredentials();
	if (credentials === null) throw new ZohoNotConfiguredError();
	return credentials;
}

export const isZohoUsable = async () => (await resolveCredentials()) !== null;

/* ------------------------------------------------------- refresh token IO */

export async function storeRefreshToken({
	refreshToken,
	organizationId,
	accountsDomain,
	apiDomain,
	connectedBy,
}) {
	await query(
		`INSERT INTO zoho_connection
		   (id, refresh_token_encrypted, refresh_token_updated_at,
		    organization_id, accounts_domain, api_domain, connected_by, connected_at)
		 VALUES (1, $1, NOW(), $2, $3, $4, $5, NOW())
		 ON CONFLICT (id) DO UPDATE
		   SET refresh_token_encrypted  = EXCLUDED.refresh_token_encrypted,
		       refresh_token_updated_at = NOW(),
		       organization_id = COALESCE(EXCLUDED.organization_id, zoho_connection.organization_id),
		       accounts_domain = EXCLUDED.accounts_domain,
		       api_domain      = EXCLUDED.api_domain,
		       connected_by    = EXCLUDED.connected_by,
		       connected_at    = NOW()`,
		[
			encryptSecret(refreshToken),
			organizationId ?? null,
			accountsDomain ?? null,
			apiDomain ?? null,
			connectedBy ?? null,
		],
	);
	invalidateAccessToken();
}

export async function clearRefreshToken() {
	await query(
		`UPDATE zoho_connection
		    SET refresh_token_encrypted = NULL, refresh_token_updated_at = NULL
		  WHERE id = 1`,
	);
	invalidateAccessToken();
}

/* ------------------------------------------------------------ token cache */

let cachedToken = null; // { accessToken, expiresAt, apiDomain }
/** In-flight refresh shared by all concurrent callers — the "lock". */
let refreshInFlight = null;

/** Refresh this far ahead of the real expiry. */
const EXPIRY_SAFETY_MARGIN_MS = 120_000;

export function invalidateAccessToken() {
	cachedToken = null;
}

async function refreshAccessToken(credentials) {
	const response = await fetch(`${credentials.accountsDomain}/oauth/v2/token`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			refresh_token: credentials.refreshToken,
			client_id: credentials.clientId,
			client_secret: credentials.clientSecret,
			grant_type: 'refresh_token',
		}),
	});

	const body = await response.json().catch(() => ({}));

	// Zoho reports OAuth failures with HTTP 200 and an `error` field, so the
	// status alone cannot tell success from failure. The error body is never
	// echoed into the thrown message: it can quote the credentials back.
	if (body.error !== undefined || typeof body.access_token !== 'string') {
		console.error('[zoho] token refresh failed', {
			reason: body.error ?? 'no_token',
			status: response.status,
		});
		throw new ZohoAuthenticationError();
	}

	const lifetimeSeconds =
		typeof body.expires_in === 'number' ? body.expires_in : 3600;

	return {
		accessToken: body.access_token,
		expiresAt: Date.now() + lifetimeSeconds * 1000 - EXPIRY_SAFETY_MARGIN_MS,
		// Prefer the domain Zoho reports over anything we inferred.
		apiDomain: trim(body.api_domain) || credentials.apiDomain,
	};
}

/**
 * A valid access token and the API domain to use it against.
 *
 * Concurrent callers share one refresh, so a burst of requests after a cold
 * start produces a single token call rather than one each.
 */
export async function getAccessToken({ forceRefresh = false } = {}) {
	const credentials = await requireResolvedCredentials();

	if (!forceRefresh && cachedToken !== null && cachedToken.expiresAt > Date.now()) {
		return { accessToken: cachedToken.accessToken, apiDomain: cachedToken.apiDomain };
	}

	if (refreshInFlight === null) {
		refreshInFlight = refreshAccessToken(credentials)
			.then((token) => {
				cachedToken = token;
				return token;
			})
			.finally(() => {
				refreshInFlight = null;
			});
	}

	const token = await refreshInFlight;
	return { accessToken: token.accessToken, apiDomain: token.apiDomain };
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
	return `${defaultAccountsDomain()}/oauth/v2/auth?${params.toString()}`;
}

export async function exchangeAuthorizationCode({ code, redirectUri }) {
	const clientId = process.env.ZOHO_CLIENT_ID;
	const clientSecret = process.env.ZOHO_CLIENT_SECRET;
	if (!clientId || !clientSecret) {
		throw new ZohoNotConfiguredError(
			'ZOHO_CLIENT_ID and ZOHO_CLIENT_SECRET are not set on the server.',
		);
	}

	const accountsDomain = defaultAccountsDomain();
	const response = await fetch(`${accountsDomain}/oauth/v2/token`, {
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

	const body = await response.json().catch(() => ({}));
	if (body.error !== undefined || typeof body.refresh_token !== 'string') {
		console.error('[zoho] authorization code exchange failed', {
			reason: body.error ?? 'no_refresh_token',
			status: response.status,
		});
		throw new ZohoAuthenticationError(
			body.error === 'invalid_code'
				? 'That authorization code was already used or has expired. Try connecting again.'
				: 'Zoho did not return a refresh token. The client must be a Server-based Application, and the redirect URI must match exactly.',
		);
	}

	return {
		refreshToken: body.refresh_token,
		accountsDomain,
		apiDomain: trim(body.api_domain) || inferApiDomain(accountsDomain),
	};
}

/** Connection health, with nothing secret in it. */
export async function connectionStatus() {
	const clientConfigured = Boolean(
		process.env.ZOHO_CLIENT_ID && process.env.ZOHO_CLIENT_SECRET,
	);
	const fromEnv = Boolean(process.env.ZOHO_REFRESH_TOKEN);
	const stored = fromEnv ? null : await loadStoredConnection().catch(() => null);
	const credentials = await resolveCredentials().catch(() => null);

	return {
		clientConfigured,
		connected: credentials !== null,
		source: fromEnv ? 'environment' : stored?.refreshToken ? 'in-app' : null,
		connectedAt: stored?.refreshToken ? (stored.connectedAt ?? null) : null,
		organizationId: credentials?.organizationId ?? null,
		apiDomain: credentials?.apiDomain ?? null,
		// True once a token has been fetched in this instance — a cheap way to
		// tell "configured" from "actually working".
		tokenCached: cachedToken !== null && cachedToken.expiresAt > Date.now(),
	};
}
