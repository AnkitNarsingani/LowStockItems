-- ============================================================================
-- 0002 — Remember what Zoho told us about the connection
--
-- The refresh token alone is not the whole connection. Zoho's token response
-- reports the api_domain for the data centre the account actually belongs to,
-- and that answer is better than anything inferred from the accounts domain.
-- The organization is likewise a property of the connection rather than of the
-- deployment.
--
-- Keeping these beside the token means a connection made through the in-app
-- flow is self-describing: it does not depend on someone also setting the
-- matching environment variables. The environment still wins where present.
-- ============================================================================

ALTER TABLE zoho_connection
  ADD COLUMN IF NOT EXISTS organization_id TEXT,
  ADD COLUMN IF NOT EXISTS accounts_domain TEXT,
  ADD COLUMN IF NOT EXISTS api_domain      TEXT;

COMMENT ON COLUMN zoho_connection.api_domain IS
  'Reported by Zoho in the token response. Preferred over any value inferred from the accounts domain.';
