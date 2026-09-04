/**
 * Database access.
 *
 * Written against plain `pg` rather than a provider-specific driver, so
 * Netlify DB (Neon) can be swapped for any other Postgres by changing the
 * connection string alone. Every query in the application goes through here,
 * and every one is parameterized — no user input is ever interpolated into
 * SQL.
 */

import pg from 'pg';
import { DatabaseUnavailableError } from './errors.mjs';

// node-postgres returns BIGINT as a string to avoid precision loss. The only
// bigints here are row counts, comfortably inside the safe integer range.
pg.types.setTypeParser(20, (value) => Number.parseInt(value, 10));

function connectionString() {
	const url =
		process.env.DATABASE_URL ??
		process.env.NETLIFY_DATABASE_URL ??
		process.env.NETLIFY_DATABASE_URL_UNPOOLED;
	if (!url) {
		throw new DatabaseUnavailableError(
			'No database connection string is configured on the server.',
		);
	}
	return url;
}

const isLocal = (url) => /localhost|127\.0\.0\.1/.test(url);

/**
 * One module-scoped pool, reused across warm invocations. `max` is small on
 * purpose: serverless scales by adding instances, so a large per-instance pool
 * exhausts the database's connection limit.
 */
let pool = null;

export function getPool() {
	if (pool !== null) return pool;

	const url = connectionString();
	pool = new pg.Pool({
		connectionString: url,
		ssl: isLocal(url) ? false : { rejectUnauthorized: true },
		max: 3,
		idleTimeoutMillis: 10_000,
		connectionTimeoutMillis: 8_000,
		statement_timeout: 20_000,
		query_timeout: 20_000,
	});

	// An idle client erroring must not take the process down.
	pool.on('error', (error) =>
		console.error('[db] idle client error', { message: error.message }),
	);

	return pool;
}

const CONNECTION_CODES = new Set([
	'ECONNREFUSED',
	'ETIMEDOUT',
	'ENOTFOUND',
	'EHOSTUNREACH',
	'57P01',
	'57P03',
	'08006',
	'08001',
]);

export async function query(text, parameters = []) {
	try {
		return await getPool().query(text, parameters);
	} catch (error) {
		if (error instanceof DatabaseUnavailableError) throw error;
		if (CONNECTION_CODES.has(String(error?.code))) {
			throw new DatabaseUnavailableError();
		}
		console.error('[db] query failed', { message: error?.message });
		throw error;
	}
}

export async function queryOne(text, parameters = []) {
	const result = await query(text, parameters);
	return result.rows[0] ?? null;
}

export async function queryMany(text, parameters = []) {
	const result = await query(text, parameters);
	return result.rows;
}
