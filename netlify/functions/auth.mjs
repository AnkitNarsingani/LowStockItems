/**
 * Authentication endpoints.
 *
 *   POST /api/auth/login
 *   POST /api/auth/logout
 *   POST /api/auth/bootstrap        first administrator, once, token-gated
 *   POST /api/auth/accept-invite
 *   POST /api/auth/change-password
 *   GET  /api/me
 *   GET  /api/auth/users            administrator
 *   POST /api/auth/invite           administrator
 *   POST /api/auth/set-user-status  administrator
 *
 * There is no self-registration: accounts exist because an administrator
 * created them.
 */

import { queryMany, queryOne, query } from '../shared/db.mjs';
import {
	buildClearSessionCookie,
	createSessionCookie,
	requireAdministrator,
	requireUser,
} from '../shared/auth/session.mjs';
import {
	INVITE_LIFETIME_SECONDS,
	hashPassword,
	hashToken,
	issueToken,
	passwordValidationMessage,
	verifyPassword,
} from '../shared/auth/password.mjs';
import {
	AccountDisabledError,
	AppError,
	InvalidCredentialsError,
	ValidationError,
} from '../shared/errors.mjs';
import {
	appBaseUrl,
	jsonSuccess,
	matchRoute,
	readJson,
	requestIp,
	requireString,
	withErrorHandling,
} from '../shared/http.mjs';

const publicProfile = (p) => ({
	id: p.id,
	email: p.email,
	displayName: p.display_name,
	role: p.role,
	status: p.status,
	lastLoginAt: p.last_login_at ?? null,
});

const findByEmail = (email) =>
	queryOne('SELECT * FROM profiles WHERE lower(email) = lower($1)', [email]);

/* ------------------------------------------------------------ rate limit */

// In-memory and therefore per warm instance — this slows credential stuffing
// against a single instance, it is not a distributed limiter. A shared limiter
// would need its own store; this is the honest, useful 90%.
const attempts = new Map();
const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 10;

function throttle(key) {
	const now = Date.now();
	const record = attempts.get(key);
	if (!record || now - record.start > WINDOW_MS) {
		attempts.set(key, { start: now, count: 1 });
		return;
	}
	record.count++;
	if (record.count > MAX_ATTEMPTS) {
		throw new AppError(
			'RATE_LIMITED',
			'Too many attempts. Wait a minute and try again.',
			429,
		);
	}
}

/* ----------------------------------------------------------------- login */

async function login(request, context) {
	const body = await readJson(request);
	const email = requireString(body, 'email');
	const password = typeof body.password === 'string' ? body.password : '';

	throttle(requestIp(request, context));

	const profile = await findByEmail(email);

	// The comparison runs even with no profile, so response timing does not
	// disclose whether the email is registered.
	const matches = await verifyPassword(password, {
		hash: profile?.password_hash ?? null,
		salt: profile?.password_salt ?? null,
	});

	if (profile === null || !matches) throw new InvalidCredentialsError();
	if (profile.status === 'disabled') throw new AccountDisabledError();
	if (profile.status === 'invited') throw new InvalidCredentialsError();

	const session = createSessionCookie(profile);
	await query('UPDATE profiles SET last_login_at = NOW() WHERE id = $1', [
		profile.id,
	]);

	return jsonSuccess({ user: publicProfile(profile) }, request, {
		headers: { 'set-cookie': session.cookie },
	});
}

const logout = async (request) =>
	jsonSuccess({ signedOut: true }, request, {
		headers: { 'set-cookie': buildClearSessionCookie() },
	});

const me = async (request) => {
	const actor = await requireUser(request);
	return jsonSuccess({ user: actor }, request);
};

/* ------------------------------------------------------------- bootstrap */

/**
 * Creates the first administrator, and only ever the first: it refuses once
 * any profile exists. Gated on BOOTSTRAP_TOKEN so an open deployment cannot be
 * claimed by whoever reaches it first.
 */
async function bootstrap(request) {
	const expected = process.env.BOOTSTRAP_TOKEN;
	if (!expected) {
		throw new AppError(
			'BOOTSTRAP_DISABLED',
			'BOOTSTRAP_TOKEN is not set on the server.',
			403,
		);
	}

	const body = await readJson(request);
	if (requireString(body, 'token') !== expected) {
		throw new AppError('BOOTSTRAP_INVALID', 'That setup token is not valid.', 403);
	}

	const existing = await queryOne('SELECT 1 AS present FROM profiles LIMIT 1');
	if (existing !== null) {
		throw new AppError(
			'BOOTSTRAP_DONE',
			'An account already exists. Ask an administrator to invite you.',
			409,
		);
	}

	const email = requireString(body, 'email');
	const displayName = requireString(body, 'displayName');
	const password = typeof body.password === 'string' ? body.password : '';

	const issue = passwordValidationMessage(password);
	if (issue) throw new ValidationError(issue, { field: 'password' });

	const { hash, salt } = await hashPassword(password);
	const profile = await queryOne(
		`INSERT INTO profiles (email, display_name, role, status, password_hash, password_salt)
		 VALUES ($1, $2, 'administrator', 'active', $3, $4)
		 RETURNING *`,
		[email, displayName, hash, salt],
	);

	const session = createSessionCookie(profile);
	return jsonSuccess({ user: publicProfile(profile) }, request, {
		status: 201,
		headers: { 'set-cookie': session.cookie },
	});
}

/* --------------------------------------------------------------- invites */

async function invite(request) {
	const actor = await requireAdministrator(request);
	const body = await readJson(request);
	const email = requireString(body, 'email');
	const displayName = requireString(body, 'displayName');
	const role = body.role === 'administrator' ? 'administrator' : 'buyer';

	if (await findByEmail(email)) {
		throw new ValidationError('That email already has an account.', {
			field: 'email',
		});
	}

	const token = issueToken(INVITE_LIFETIME_SECONDS);
	const profile = await queryOne(
		`INSERT INTO profiles (email, display_name, role, status, invite_token_hash, invite_expires_at)
		 VALUES ($1, $2, $3, 'invited', $4, $5)
		 RETURNING *`,
		[email, displayName, role, token.tokenHash, token.expiresAt],
	);

	// There is no mail transport in this project, so the link is returned to
	// the administrator to pass on. Only its hash is stored, so this response
	// is the single moment the raw token exists.
	return jsonSuccess(
		{
			user: publicProfile(profile),
			inviteLink: `${appBaseUrl()}/accept-invite?token=${encodeURIComponent(token.token)}`,
			expiresAt: token.expiresAt,
			invitedBy: actor.email,
		},
		request,
		{ status: 201 },
	);
}

async function acceptInvite(request) {
	const body = await readJson(request);
	const token = requireString(body, 'token', { max: 200 });
	const password = typeof body.password === 'string' ? body.password : '';

	const issue = passwordValidationMessage(password);
	if (issue) throw new ValidationError(issue, { field: 'password' });

	const profile = await queryOne(
		'SELECT * FROM profiles WHERE invite_token_hash = $1',
		[hashToken(token)],
	);
	if (profile === null) {
		throw new AppError('INVITE_INVALID', 'This invitation link is not valid.', 400);
	}
	if (profile.invite_expires_at && new Date(profile.invite_expires_at) <= new Date()) {
		throw new AppError(
			'INVITE_EXPIRED',
			'This invitation has expired. Ask an administrator for a new one.',
			400,
		);
	}

	const { hash, salt } = await hashPassword(password);
	const activated = await queryOne(
		`UPDATE profiles
		    SET password_hash = $2, password_salt = $3, status = 'active',
		        invite_token_hash = NULL, invite_expires_at = NULL, updated_at = NOW()
		  WHERE id = $1
		  RETURNING *`,
		[profile.id, hash, salt],
	);

	const session = createSessionCookie(activated);
	return jsonSuccess({ user: publicProfile(activated) }, request, {
		headers: { 'set-cookie': session.cookie },
	});
}

/* ------------------------------------------------------- change password */

async function changePassword(request) {
	const actor = await requireUser(request);
	const body = await readJson(request);
	const current = typeof body.currentPassword === 'string' ? body.currentPassword : '';
	const next = typeof body.newPassword === 'string' ? body.newPassword : '';

	const issue = passwordValidationMessage(next);
	if (issue) throw new ValidationError(issue, { field: 'newPassword' });

	const profile = await queryOne('SELECT * FROM profiles WHERE id = $1', [actor.id]);
	const matches = await verifyPassword(current, {
		hash: profile?.password_hash ?? null,
		salt: profile?.password_salt ?? null,
	});
	if (!matches) {
		throw new ValidationError('Your current password is incorrect.', {
			field: 'currentPassword',
		});
	}

	const { hash, salt } = await hashPassword(next);
	await query(
		'UPDATE profiles SET password_hash = $2, password_salt = $3, updated_at = NOW() WHERE id = $1',
		[actor.id, hash, salt],
	);

	return jsonSuccess({ changed: true }, request);
}

/* ----------------------------------------------------------- user admin */

async function listUsers(request) {
	await requireAdministrator(request);
	const rows = await queryMany(
		'SELECT * FROM profiles ORDER BY lower(display_name)',
	);
	return jsonSuccess({ users: rows.map(publicProfile) }, request);
}

async function setUserStatus(request) {
	const actor = await requireAdministrator(request);
	const body = await readJson(request);
	const userId = requireString(body, 'userId', { max: 64 });
	const status = body.status === 'disabled' ? 'disabled' : 'active';

	// Locking yourself out is not a recoverable mistake without database access.
	if (userId === actor.id && status === 'disabled') {
		throw new ValidationError('You cannot disable your own account.');
	}

	const updated = await queryOne(
		`UPDATE profiles SET status = $2, updated_at = NOW()
		  WHERE id = $1 AND status <> 'invited'
		  RETURNING *`,
		[userId, status],
	);
	if (updated === null) {
		throw new AppError('NOT_FOUND', 'No such active account.', 404);
	}
	return jsonSuccess({ user: publicProfile(updated) }, request);
}

/* ------------------------------------------------------------------ route */

const routes = [
	{ method: 'POST', pattern: '/api/auth/login', handler: login },
	{ method: 'POST', pattern: '/api/auth/logout', handler: logout },
	{ method: 'POST', pattern: '/api/auth/bootstrap', handler: bootstrap },
	{ method: 'POST', pattern: '/api/auth/invite', handler: invite },
	{ method: 'POST', pattern: '/api/auth/accept-invite', handler: acceptInvite },
	{ method: 'POST', pattern: '/api/auth/change-password', handler: changePassword },
	{ method: 'POST', pattern: '/api/auth/set-user-status', handler: setUserStatus },
	{ method: 'GET', pattern: '/api/auth/users', handler: listUsers },
	{ method: 'GET', pattern: '/api/me', handler: me },
];

export default withErrorHandling(async (request, context) => {
	const match = matchRoute(routes, request);
	if (match === null) {
		throw new AppError('NOT_FOUND', 'No such endpoint.', 404);
	}
	return match.handler(request, context);
});

export const config = {
	path: [
		'/api/auth/login',
		'/api/auth/logout',
		'/api/auth/bootstrap',
		'/api/auth/invite',
		'/api/auth/accept-invite',
		'/api/auth/change-password',
		'/api/auth/set-user-status',
		'/api/auth/users',
		'/api/me',
	],
};
