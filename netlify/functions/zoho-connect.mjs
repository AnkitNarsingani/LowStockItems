/**
 * Connecting Zoho, once, from inside the app.
 *
 *   GET  /api/zoho/status      connection health (no secrets)
 *   GET  /api/zoho/connect     starts the OAuth flow (administrator)
 *   GET  /api/zoho/callback    Zoho's redirect target
 *   POST /api/zoho/disconnect  forgets the stored token (administrator)
 *
 * This is the authorization-code flow, not the implicit grant the browser used
 * to run: Zoho returns a refresh token to the *server*, which stores it
 * encrypted. No response from this module ever contains a client secret, a
 * refresh token or an access token.
 */

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import {
	requireAdministrator,
	requireUser,
} from '../shared/auth/session.mjs';
import { AppError, ValidationError } from '../shared/errors.mjs';
import {
	appBaseUrl,
	jsonSuccess,
	matchRoute,
	withErrorHandling,
} from '../shared/http.mjs';
import {
	buildAuthorizationUrl,
	clearRefreshToken,
	connectionStatus,
	exchangeAuthorizationCode,
	storeRefreshToken,
} from '../shared/zoho/tokens.mjs';

const redirectUri = () => `${appBaseUrl()}/api/zoho/callback`;

/* ------------------------------------------------------------------ state */

/**
 * The `state` parameter is a signed, expiring token rather than a random value
 * held in a session store — serverless instances do not share memory, so the
 * instance handling the callback is rarely the one that started the flow.
 * Signing it means the callback can verify the flow began here without any
 * shared state at all.
 */
function issueState(actorId) {
	const payload = Buffer.from(
		JSON.stringify({ a: actorId, n: randomBytes(8).toString('hex'), t: Date.now() }),
	).toString('base64url');
	const signature = createHmac('sha256', stateSecret())
		.update(payload)
		.digest('base64url');
	return `${payload}.${signature}`;
}

function stateSecret() {
	const value = process.env.AUTH_JWT_SECRET;
	if (!value || value.length < 32) {
		throw new Error('AUTH_JWT_SECRET is missing or too short.');
	}
	return value;
}

const STATE_LIFETIME_MS = 10 * 60 * 1000;

function verifyState(state) {
	const parts = String(state ?? '').split('.');
	if (parts.length !== 2) return null;

	const [payload, signature] = parts;
	const expected = Buffer.from(
		createHmac('sha256', stateSecret()).update(payload).digest('base64url'),
		'utf8',
	);
	const provided = Buffer.from(signature, 'utf8');
	if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
		return null;
	}

	try {
		const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
		if (Date.now() - Number(decoded.t) > STATE_LIFETIME_MS) return null;
		return decoded;
	} catch {
		return null;
	}
}

/* --------------------------------------------------------------- handlers */

const status = async (request) => {
	await requireUser(request);
	return jsonSuccess(await connectionStatus(), request);
};

const connect = async (request) => {
	const actor = await requireAdministrator(request);
	const url = buildAuthorizationUrl({
		redirectUri: redirectUri(),
		state: issueState(actor.id),
	});
	// A redirect rather than a JSON payload, so the browser can simply follow it.
	return new Response(null, { status: 302, headers: { location: url } });
};

/**
 * Zoho sends the browser here. There is no session guarantee on this request —
 * it is a top-level navigation from another origin — so the signed state is
 * what authorizes it.
 */
const callback = async (request) => {
	const params = new URL(request.url).searchParams;
	const landing = `${appBaseUrl()}/settings`;

	const failure = (reason) =>
		new Response(null, {
			status: 302,
			headers: { location: `${landing}?zoho=error&reason=${encodeURIComponent(reason)}` },
		});

	if (params.get('error')) return failure(params.get('error'));

	const state = verifyState(params.get('state'));
	if (state === null) return failure('state-invalid');

	const code = params.get('code');
	if (!code) return failure('no-code');

	try {
		const { refreshToken } = await exchangeAuthorizationCode({
			code,
			redirectUri: redirectUri(),
		});
		await storeRefreshToken(refreshToken, state.a);
	} catch (error) {
		return failure(error?.code ?? 'exchange-failed');
	}

	return new Response(null, {
		status: 302,
		headers: { location: `${landing}?zoho=connected` },
	});
};

const disconnect = async (request) => {
	await requireAdministrator(request);
	if (process.env.ZOHO_REFRESH_TOKEN) {
		throw new ValidationError(
			'The refresh token comes from the ZOHO_REFRESH_TOKEN environment variable. Remove it there to disconnect.',
		);
	}
	await clearRefreshToken();
	return jsonSuccess({ disconnected: true }, request);
};

/* ------------------------------------------------------------------ route */

const routes = [
	{ method: 'GET', pattern: '/api/zoho/status', handler: status },
	{ method: 'GET', pattern: '/api/zoho/connect', handler: connect },
	{ method: 'GET', pattern: '/api/zoho/callback', handler: callback },
	{ method: 'POST', pattern: '/api/zoho/disconnect', handler: disconnect },
];

export default withErrorHandling(async (request, context) => {
	const match = matchRoute(routes, request);
	if (match === null) throw new AppError('NOT_FOUND', 'No such endpoint.', 404);
	return match.handler(request, context);
});

export const config = {
	path: [
		'/api/zoho/status',
		'/api/zoho/connect',
		'/api/zoho/callback',
		'/api/zoho/disconnect',
	],
};
