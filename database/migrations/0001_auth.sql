-- ============================================================================
-- 0001 — Accounts, and server-side storage for the Zoho connection
--
-- Replaces the browser-side Zoho implicit grant. Before this, there were no
-- application accounts at all: anyone who could sign into the Zoho org could
-- use the app, and the access token sat in localStorage where any script on
-- the page could read it.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('administrator', 'buyer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE user_status AS ENUM ('invited', 'active', 'disabled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- This account runs more than one Netlify app against Neon, and at least one
-- other defines its own `profiles` table and `user_role` enum with different
-- values. Sharing a database between them would silently merge two apps' user
-- accounts. Catching a pre-existing, foreign `user_role` here turns that into
-- a failed migration with an explanation, instead of a runtime error weeks
-- later when someone is given a role the enum has never heard of.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
     WHERE t.typname = 'user_role' AND e.enumlabel = 'buyer'
  ) THEN
    RAISE EXCEPTION
      'A user_role type already exists here without a ''buyer'' value, so this database belongs to another application. Give LowStockItems its own database.';
  END IF;
END $$;

CREATE TABLE profiles (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Stored verbatim; uniqueness and lookups go through lower(email), so the
  -- citext extension is not needed and the schema stays portable.
  email             TEXT        NOT NULL,
  display_name      TEXT        NOT NULL,
  role              user_role   NOT NULL DEFAULT 'buyer',
  status            user_status NOT NULL DEFAULT 'invited',

  password_hash     TEXT,
  password_salt     TEXT,
  invite_token_hash TEXT,
  invite_expires_at TIMESTAMPTZ,
  reset_token_hash  TEXT,
  reset_expires_at  TIMESTAMPTZ,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at     TIMESTAMPTZ,

  CONSTRAINT profiles_email_not_blank CHECK (length(trim(email)) > 0),
  CONSTRAINT profiles_display_name_not_blank CHECK (length(trim(display_name)) > 0),
  -- An active account must be able to authenticate.
  CONSTRAINT profiles_active_has_password
    CHECK (status <> 'active' OR password_hash IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS profiles_email_lower_key
  ON profiles (lower(email));

CREATE INDEX IF NOT EXISTS profiles_invite_token_idx
  ON profiles (invite_token_hash) WHERE invite_token_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS profiles_reset_token_idx
  ON profiles (reset_token_hash) WHERE reset_token_hash IS NOT NULL;

-- ---------------------------------------------------------------------------
-- The Zoho connection. A single row (id = 1) — this app talks to exactly one
-- Zoho organization.
--
-- The refresh token is AES-256-GCM ciphertext under a key held in the
-- environment, so a database dump alone does not yield a usable Zoho
-- credential. It is never returned by any endpoint.
-- ---------------------------------------------------------------------------
CREATE TABLE zoho_connection (
  id                       SMALLINT PRIMARY KEY DEFAULT 1,
  refresh_token_encrypted  TEXT,
  refresh_token_updated_at TIMESTAMPTZ,
  connected_by             UUID REFERENCES profiles (id) ON DELETE SET NULL,
  connected_at             TIMESTAMPTZ,

  CONSTRAINT zoho_connection_single_row CHECK (id = 1)
);

COMMENT ON COLUMN zoho_connection.refresh_token_encrypted IS
  'AES-256-GCM ciphertext (iv.tag.data, base64url). Server-only. Never returned by any API.';
