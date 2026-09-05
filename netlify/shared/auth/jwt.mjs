/**
 * HS256 JSON Web Tokens.
 *
 * Built on `node:crypto` rather than a library so the verification path is
 * small enough to audit in full. Only HS256 is accepted: the `alg` header is
 * compared against a constant, which closes the classic "alg: none" and
 * algorithm-confusion attacks. The signing secret lives in AUTH_JWT_SECRET and
 * never leaves the server.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { SessionExpiredError, UnauthenticatedError } from '../errors.mjs';

const ALGORITHM = 'HS256';

const b64u = (input) => Buffer.from(input).toString('base64url');
const unb64u = (input) => Buffer.from(input, 'base64url');

function secret() {
	const value = process.env.AUTH_JWT_SECRET;
	if (!value || value.length < 32) {
		throw new Error(
			'AUTH_JWT_SECRET is missing or shorter than 32 characters. Generate one with: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'base64url\'))"',
		);
	}
	return Buffer.from(value, 'utf8');
}

const sign = (data) =>
	createHmac('sha256', secret()).update(data).digest('base64url');

export function signJwt(payload, lifetimeSeconds) {
	const issuedAt = Math.floor(Date.now() / 1000);
	const body = { ...payload, iat: issuedAt, exp: issuedAt + lifetimeSeconds };
	const header = b64u(JSON.stringify({ alg: ALGORITHM, typ: 'JWT' }));
	const claims = b64u(JSON.stringify(body));
	return `${header}.${claims}.${sign(`${header}.${claims}`)}`;
}

export function verifyJwt(token) {
	const parts = String(token).split('.');
	if (parts.length !== 3) throw new UnauthenticatedError();

	const [header, claims, signature] = parts;

	let decodedHeader;
	try {
		decodedHeader = JSON.parse(unb64u(header).toString('utf8'));
	} catch {
		throw new UnauthenticatedError();
	}
	// The one check that matters most: never let the token choose its algorithm.
	if (decodedHeader?.alg !== ALGORITHM) throw new UnauthenticatedError();

	const expected = Buffer.from(sign(`${header}.${claims}`), 'utf8');
	const provided = Buffer.from(signature, 'utf8');
	if (
		expected.length !== provided.length ||
		!timingSafeEqual(expected, provided)
	) {
		throw new UnauthenticatedError();
	}

	let payload;
	try {
		payload = JSON.parse(unb64u(claims).toString('utf8'));
	} catch {
		throw new UnauthenticatedError();
	}

	if (
		typeof payload?.exp !== 'number' ||
		payload.exp <= Math.floor(Date.now() / 1000)
	) {
		throw new SessionExpiredError();
	}

	return payload;
}
