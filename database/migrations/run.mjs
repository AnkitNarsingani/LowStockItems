/**
 * Migration runner.
 *
 *   node database/migrations/run.mjs
 *
 * Applies every .sql file in this directory in filename order, once. Applied
 * names are recorded in `schema_migrations`, and each file runs inside a
 * transaction so a failure leaves nothing half-applied.
 *
 * Reads DATABASE_URL (or NETLIFY_DATABASE_URL). For Netlify DB, copy the
 * connection string from the Netlify UI, or run through `netlify dev` so it is
 * injected for you.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const here = dirname(fileURLToPath(import.meta.url));

const url =
	process.env.DATABASE_URL ??
	process.env.NETLIFY_DATABASE_URL ??
	process.env.NETLIFY_DATABASE_URL_UNPOOLED;

if (!url) {
	console.error(
		'No DATABASE_URL / NETLIFY_DATABASE_URL set. Export one and try again.',
	);
	process.exit(1);
}

const client = new pg.Client({
	connectionString: url,
	ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: true },
});

await client.connect();

await client.query(`
	CREATE TABLE IF NOT EXISTS schema_migrations (
		name       TEXT PRIMARY KEY,
		applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
	)
`);

const applied = new Set(
	(await client.query('SELECT name FROM schema_migrations')).rows.map(
		(r) => r.name,
	),
);

const files = readdirSync(here)
	.filter((name) => name.endsWith('.sql'))
	.sort();

let ran = 0;
for (const name of files) {
	if (applied.has(name)) {
		console.log(`· ${name} (already applied)`);
		continue;
	}
	const sql = readFileSync(join(here, name), 'utf8');
	try {
		await client.query('BEGIN');
		await client.query(sql);
		await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
		await client.query('COMMIT');
		console.log(`✓ ${name}`);
		ran++;
	} catch (error) {
		await client.query('ROLLBACK');
		console.error(`✗ ${name}\n  ${error.message}`);
		await client.end();
		process.exit(1);
	}
}

console.log(
	ran === 0 ? 'Nothing to do — schema is up to date.' : `Applied ${ran} migration(s).`,
);
await client.end();
