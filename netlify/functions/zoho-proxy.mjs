/**
 * Authenticated pass-through to the Zoho Books API.
 *
 *   /api/zoho/books/v3/<anything>  →  <api domain>/books/v3/<anything>
 *
 * Why a proxy rather than an endpoint per resource: the client already speaks
 * Books' API across roughly twenty-five call sites, with its own pagination,
 * progress reporting and caching built around those shapes. Re-expressing all
 * of that as bespoke endpoints would be a large rewrite of working code for no
 * gain in what actually matters here — which is that the browser stops holding
 * a Zoho credential.
 *
 * What this adds over the old Cloudflare Worker it replaces:
 *   · a session is required, so the app is no longer open to anyone who finds
 *     the URL;
 *   · the access token is attached here and never reaches the browser;
 *   · organization_id is forced from server configuration, so a caller cannot
 *     point the app at a different Zoho organization.
 */

import { requireUser } from '../shared/auth/session.mjs';
import { AppError } from '../shared/errors.mjs';
import { jsonError, preflight } from '../shared/http.mjs';
import {
	getAccessToken,
	invalidateAccessToken,
	requireResolvedCredentials,
} from '../shared/zoho/tokens.mjs';

const PREFIX = '/api/zoho/books/v3/';

// Hop-by-hop and identity headers must not be forwarded: they either belong to
// this connection or would let the caller impersonate something upstream.
const STRIP = new Set([
	'host',
	'connection',
	'authorization',
	'cookie',
	'content-length',
	'accept-encoding',
	'origin',
	'referer',
	'x-forwarded-for',
	'x-forwarded-host',
	'x-forwarded-proto',
	'x-nf-client-connection-ip',
]);

async function callZoho(request, buildUrl, body, options) {
	const { accessToken, apiDomain } = await getAccessToken(options);

	const headers = new Headers();
	for (const [name, value] of request.headers) {
		if (!STRIP.has(name.toLowerCase())) headers.set(name, value);
	}
	headers.set('Authorization', `Zoho-oauthtoken ${accessToken}`);

	// The domain comes from the token, not from configuration: Zoho reports
	// the data centre the account actually lives in, and a token is only valid
	// against that one.
	return fetch(buildUrl(apiDomain), {
		method: request.method,
		headers,
		body,
		redirect: 'manual',
	});
}

export default async (request) => {
	if (request.method === 'OPTIONS') return preflight(request);

	try {
		// Every proxied call is an authenticated one.
		await requireUser(request);

		const url = new URL(request.url);
		if (!url.pathname.startsWith(PREFIX)) {
			throw new AppError('NOT_FOUND', 'Unsupported Zoho path.', 404);
		}

		const resource = url.pathname.slice(PREFIX.length);
		// Defence in depth against a traversal that escapes /books/v3.
		if (resource.includes('..')) {
			throw new AppError('NOT_FOUND', 'Unsupported Zoho path.', 404);
		}

		const { organizationId } = await requireResolvedCredentials();
		const params = new URLSearchParams(url.search);
		params.set('organization_id', organizationId);

		const buildUrl = (apiDomain) =>
			`${apiDomain}/books/v3/${resource}${params.toString() ? `?${params}` : ''}`;

		// Read the body once: a retry cannot re-read a consumed stream.
		const body =
			request.method === 'GET' || request.method === 'HEAD'
				? undefined
				: await request.text();

		let response = await callZoho(request, buildUrl, body);

		// A 401 means the cached access token died early — Zoho can revoke one
		// before its stated expiry. Force one refresh and retry; a second 401
		// is a real credential problem and is passed through.
		if (response.status === 401) {
			invalidateAccessToken();
			response = await callZoho(request, buildUrl, body, { forceRefresh: true });
		}

		const payload = await response.text();
		const headers = new Headers({
			'Content-Type': response.headers.get('content-type') ?? 'application/json',
			'Access-Control-Allow-Origin': request.headers.get('origin') ?? '',
			'Access-Control-Allow-Credentials': 'true',
			Vary: 'Origin',
			// Zoho responses are per-user data; never let a shared cache hold one.
			'Cache-Control': 'no-store',
		});
		return new Response(payload, { status: response.status, headers });
	} catch (error) {
		return jsonError(error, request);
	}
};

export const config = { path: '/api/zoho/books/v3/*' };
