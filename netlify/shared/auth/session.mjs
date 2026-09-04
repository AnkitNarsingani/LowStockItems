/**
 * Session cookies and request authorization.
 *
 * The session JWT lives in an httpOnly, Secure, SameSite=Lax cookie, so it is
 * unreadable from JavaScript and never appears in a URL. This is the whole
 * point of the migration: the browser no longer holds a credential it can be
 * tricked into handing over, which is exactly what a Zoho access token in
 * localStorage was.
 *
 * `requireUser` re-reads the profile from the database on every protected
 * request rather than trusting the token's claims, so disabling an account
 * takes effect immediately instead of at token expiry.
 */

import {
	AccountDisabledError,
	ForbiddenError,
	UnauthenticatedError,
} from '../errors.mjs';
import { queryOne } from '../db.mjs';
import { signJwt, verifyJwt } from './jwt.mjs';
import { newSessionId } from './password.mjs';

// The __Host- prefix pins the cookie to this exact origin with Path=/ and
// forbids a Domain attribute — a subdomain cannot overwrite it. It requires
// Secure, so plain-http local development falls back to the bare name.
export const COOKIE_SECURE = '__Host-lsi_session';
export const COOKIE_INSECURE = 'lsi_session';

export function isSecureContext() {
	const base = process.env.APP_BASE_URL ?? '';
	if (base.startsWith('https://')) return true;
	return process.env.NODE_ENV === 'production' && !base.startsWith('http://localhost');
}

export const cookieName = () =>
	isSecureContext() ? COOKIE_SECURE : COOKIE_INSECURE;

export function sessionLifetimeSeconds() {
	const configured = Number.parseInt(process.env.AUTH_SESSION_SECONDS ?? '', 10);
	if (Number.isInteger(configured) && configured >= 300 && configured <= 7 * 24 * 3600) {
		return configured;
	}
	return 12 * 3600;
}

/* ---------------------------------------------------------------- cookies */

export function parseCookies(request) {
	const header = request.headers.get('cookie');
	if (!header) return {};
	const out = {};
	for (const part of header.split(';')) {
		const eq = part.indexOf('=');
		if (eq === -1) continue;
		const name = part.slice(0, eq).trim();
		if (name) out[name] = decodeURIComponent(part.slice(eq + 1).trim());
	}
	return out;
}

export function buildSessionCookie(token, maxAgeSeconds) {
	const attributes = [
		`${cookieName()}=${encodeURIComponent(token)}`,
		'Path=/',
		'HttpOnly',
		'SameSite=Lax',
		`Max-Age=${maxAgeSeconds}`,
	];
	if (isSecureContext()) attributes.push('Secure');
	return attributes.join('; ');
}

export function buildClearSessionCookie() {
	const attributes = [`${cookieName()}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
	if (isSecureContext()) attributes.push('Secure');
	return attributes.join('; ');
}

export function createSessionCookie(profile) {
	const lifetime = sessionLifetimeSeconds();
	const token = signJwt(
		{
			sub: profile.id,
			sid: newSessionId(),
			role: profile.role,
			email: profile.email,
			name: profile.display_name ?? profile.displayName,
		},
		lifetime,
	);
	return { cookie: buildSessionCookie(token, lifetime), expiresInSeconds: lifetime };
}

/* ------------------------------------------------------------ actor model */

export async function requireUser(request) {
	const cookies = parseCookies(request);
	const token =
		cookies[cookieName()] ?? cookies[COOKIE_SECURE] ?? cookies[COOKIE_INSECURE];

	if (!token) throw new UnauthenticatedError();

	const payload = verifyJwt(token); // throws Unauthenticated / SessionExpired

	// Authoritative re-read: the token is only a pointer to a profile.
	const profile = await queryOne(
		'SELECT id, email, display_name, role, status FROM profiles WHERE id = $1',
		[payload.sub],
	);

	if (profile === null) throw new UnauthenticatedError('This account no longer exists.');
	if (profile.status === 'disabled') throw new AccountDisabledError();
	if (profile.status === 'invited') {
		throw new UnauthenticatedError('Finish setting up your account before signing in.');
	}

	return {
		id: profile.id,
		email: profile.email,
		displayName: profile.display_name,
		role: profile.role,
		sessionId: payload.sid,
	};
}

export async function requireAdministrator(request) {
	const actor = await requireUser(request);
	if (actor.role !== 'administrator') throw new ForbiddenError();
	return actor;
}
