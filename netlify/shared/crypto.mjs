/**
 * AES-256-GCM for secrets that have to be persisted.
 *
 * Only the Zoho refresh token uses this. It is a long-lived credential that
 * the in-app OAuth flow produces at runtime, so it cannot live in an
 * environment variable the way a build-time secret can. Encrypting it means a
 * database dump on its own does not yield a usable Zoho credential — the key
 * lives in the environment, the ciphertext in the database.
 *
 * GCM, not CBC: it authenticates as well as encrypts, so tampering is detected
 * rather than silently decrypting to garbage.
 */

import {
	createCipheriv,
	createDecipheriv,
	createHash,
	randomBytes,
} from 'node:crypto';

const IV_BYTES = 12; // 96 bits, the size GCM is specified for.

function key() {
	const material = process.env.ZOHO_TOKEN_KEY ?? process.env.AUTH_JWT_SECRET;
	if (!material || material.length < 32) {
		throw new Error(
			'ZOHO_TOKEN_KEY (or AUTH_JWT_SECRET) must be set and at least 32 characters.',
		);
	}
	// Hashed to exactly 32 bytes so any passphrase length works as a key.
	return createHash('sha256').update(material).digest();
}

/** Returns `iv.tag.ciphertext`, each base64url. */
export function encryptSecret(plaintext) {
	const iv = randomBytes(IV_BYTES);
	const cipher = createCipheriv('aes-256-gcm', key(), iv);
	const encrypted = Buffer.concat([
		cipher.update(String(plaintext), 'utf8'),
		cipher.final(),
	]);
	return [
		iv.toString('base64url'),
		cipher.getAuthTag().toString('base64url'),
		encrypted.toString('base64url'),
	].join('.');
}

export function decryptSecret(payload) {
	const parts = String(payload).split('.');
	if (parts.length !== 3) throw new Error('Malformed encrypted value.');
	const [iv, tag, data] = parts.map((p) => Buffer.from(p, 'base64url'));

	const decipher = createDecipheriv('aes-256-gcm', key(), iv);
	decipher.setAuthTag(tag);
	return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}
