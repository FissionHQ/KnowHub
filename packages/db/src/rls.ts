import type { Db } from "./client.js";
import { sql } from "drizzle-orm";

type DbExecutor = Pick<Db, "execute">;

/**
 * Sets the PostgreSQL session variable used by RLS policies.
 * Must be called at the start of every transaction/request.
 *
 * Uses SET LOCAL so the value is scoped to the current transaction only.
 */
export async function setTenantContext(db: DbExecutor, orgId: string): Promise<void> {
  await db.execute(sql`SELECT set_config('app.current_org_id', ${orgId}, true)`);
}

/**
 * RLS SQL policies to be applied in migration.
 * Each tenant table has a policy that restricts rows to the current org.
 */
export const RLS_POLICIES = `
-- Enable RLS on all tenant tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE spaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE space_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE invite_tokens ENABLE ROW LEVEL SECURITY;

-- RLS policies scoped to app.current_org_id
CREATE POLICY tenant_isolation_users ON users
  USING (org_id = current_setting('app.current_org_id', true)::uuid);

CREATE POLICY tenant_isolation_groups ON groups
  USING (org_id = current_setting('app.current_org_id', true)::uuid);

CREATE POLICY tenant_isolation_group_memberships ON group_memberships
  USING (
    group_id IN (
      SELECT id FROM groups WHERE org_id = current_setting('app.current_org_id', true)::uuid
    )
  );

CREATE POLICY tenant_isolation_spaces ON spaces
  USING (org_id = current_setting('app.current_org_id', true)::uuid);

CREATE POLICY tenant_isolation_space_permissions ON space_permissions
  USING (
    space_id IN (
      SELECT id FROM spaces WHERE org_id = current_setting('app.current_org_id', true)::uuid
    )
  );

CREATE POLICY tenant_isolation_documents ON documents
  USING (org_id = current_setting('app.current_org_id', true)::uuid);

CREATE POLICY tenant_isolation_document_permissions ON document_permissions
  USING (
    document_id IN (
      SELECT id FROM documents WHERE org_id = current_setting('app.current_org_id', true)::uuid
    )
  );

CREATE POLICY tenant_isolation_document_versions ON document_versions
  USING (
    document_id IN (
      SELECT id FROM documents WHERE org_id = current_setting('app.current_org_id', true)::uuid
    )
  );

CREATE POLICY tenant_isolation_attachments ON attachments
  USING (org_id = current_setting('app.current_org_id', true)::uuid);

CREATE POLICY tenant_isolation_audit_log ON audit_log
  USING (org_id = current_setting('app.current_org_id', true)::uuid);

CREATE POLICY tenant_isolation_invite_tokens ON invite_tokens
  USING (org_id = current_setting('app.current_org_id', true)::uuid);
`;
