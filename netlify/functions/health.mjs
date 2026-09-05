/**
 * Deployment health — GET /api/health
 *
 * Deliberately unauthenticated, because the things most likely to be wrong
 * (no database, no signing secret) are exactly the things that would stop you
 * authenticating to ask. Netlify does not expose build logs over its API, so
 * without this there is no way to tell a missing environment variable from an
 * unreachable database from a schema that never applied.
 *
 * It reports presence and reachability only: booleans, counts and error codes.
 * No secret, connection string, host or stack trace is ever included, so it is
 * safe to leave enabled.
 */

import { connectionInfo, queryOne } from '../shared/db.mjs';

const present = (name) => Boolean(process.env[name] && process.env[name].length > 0);

export default async () => {
	const env = {
		APP_BASE_URL: present('APP_BASE_URL'),
		AUTH_JWT_SECRET: present('AUTH_JWT_SECRET'),
		AUTH_JWT_SECRET_long_enough:
			(process.env.AUTH_JWT_SECRET ?? '').length >= 32,
		BOOTSTRAP_TOKEN: present('BOOTSTRAP_TOKEN'),
		DATABASE_URL: present('DATABASE_URL'),
		NETLIFY_DATABASE_URL: present('NETLIFY_DATABASE_URL'),
		ZOHO_CLIENT_ID: present('ZOHO_CLIENT_ID'),
		ZOHO_CLIENT_SECRET: present('ZOHO_CLIENT_SECRET'),
		ZOHO_ORGANIZATION_ID: present('ZOHO_ORGANIZATION_ID'),
	};

	const database = {
		...connectionInfo(),
		reachable: false,
		schemaReady: false,
		profileCount: null,
		migrationsApplied: null,
		errorCode: null,
	};

	try {
		await queryOne('SELECT 1 AS ok');
		database.reachable = true;

		const table = await queryOne(
			"SELECT to_regclass('public.profiles') IS NOT NULL AS present",
		);
		database.schemaReady = Boolean(table?.present);

		if (database.schemaReady) {
			const count = await queryOne('SELECT count(*)::int AS n FROM profiles');
			database.profileCount = count?.n ?? 0;
		}

		const migrations = await queryOne(
			"SELECT count(*)::int AS n FROM schema_migrations WHERE to_regclass('public.schema_migrations') IS NOT NULL",
		).catch(() => null);
		database.migrationsApplied = migrations?.n ?? 0;
	} catch (error) {
		// The code, never the message: a pg error can echo the connection target.
		database.errorCode = error?.code ?? error?.pgCode ?? 'UNKNOWN';
	}

	const ready =
		env.AUTH_JWT_SECRET_long_enough && database.reachable && database.schemaReady;

	return Response.json(
		{ ok: true, data: { ready, env, database } },
		{ status: 200, headers: { 'Cache-Control': 'no-store' } },
	);
};

export const config = { path: '/api/health' };
