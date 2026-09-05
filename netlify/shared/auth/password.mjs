/**
 * Password hashing and single-use link tokens.
 *
 * scrypt from `node:crypto`: memory-hard, in the standard library, and with
 * well-understood parameters. Every password gets its own random salt and all
 * comparisons are constant-time.
 */

import {
	createHash,
	randomBytes,
	randomUUID,
	scrypt as scryptCallback,
	timingSafeEqual,
} from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);

const KEY_LENGTH = 64;
const SALT_BYTES = 32;

export async function hashPassword(password) {
	const salt = randomBytes(SALT_BYTES).toString('base64');
	const derived = await scrypt(password, salt, KEY_LENGTH);
	return { hash: derived.toString('base64'), salt };
}

/**
 * Constant-time verification.
 *
 * With no stored hash we still run a dummy scrypt, so the time taken to answer
 * does not disclose whether the email belongs to an account.
 */
export async function verifyPassword(password, { hash, salt }) {
	if (!hash || !salt) {
		await scrypt(password, 'timing-equalizer-salt', KEY_LENGTH);
		return false;
	}
	const derived = await scrypt(password, salt, KEY_LENGTH);
	const expected = Buffer.from(hash, 'base64');
	if (expected.length !== derived.length) return false;
	return timingSafeEqual(expected, derived);
}

/* ------------------------------------------------------ password strength */

export const MIN_PASSWORD_LENGTH = 12;

export function passwordValidationMessage(password) {
	if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
		return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
	}
	if (password.length > 200) {
		return 'Password must be 200 characters or fewer.';
	}
	// Variety without rules that push people toward predictable substitutions.
	const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((p) =>
		p.test(password),
	).length;
	if (classes < 3) {
		return 'Use at least three of: lowercase, uppercase, digits, symbols.';
	}
	return null;
}

/* ------------------------------------------------- invite / reset tokens */

/**
 * The raw token goes in the link; only its hash is stored, so a leaked table
 * cannot be used to take over an account.
 */
export function issueToken(lifetimeSeconds) {
	const token = `${randomUUID()}.${randomBytes(24).toString('base64url')}`;
	return {
		token,
		tokenHash: hashToken(token),
		expiresAt: new Date(Date.now() + lifetimeSeconds * 1000),
	};
}

/** SHA-256 is right here: the token is already high-entropy random. */
export const hashToken = (token) =>
	createHash('sha256').update(token).digest('hex');

export const newSessionId = () => randomUUID();

export const INVITE_LIFETIME_SECONDS = 7 * 24 * 3600;
export const RESET_LIFETIME_SECONDS = 60 * 60;
