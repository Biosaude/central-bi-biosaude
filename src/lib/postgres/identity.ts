import { createHash, randomBytes } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import type { Principal, Role } from "../domain.ts";
import type { LoginAttempt } from "../entra.ts";
import { inTransaction } from "./transaction.ts";

export const loginSeconds = 10 * 60;
export const sessionSeconds = 8 * 60 * 60;
const idleSeconds = 30 * 60;

export const randomToken = () => randomBytes(32).toString("base64url");
export const tokenHash = (token?: string) =>
  token && /^[\w-]{43}$/.test(token)
    ? createHash("sha256").update(token).digest("hex")
    : null;

type EntraIdentity = { tenantId: string; objectId: string };
type SessionUser = EntraIdentity & { id: string; role: Role };
export type PortalPrincipal = Principal & SessionUser;
type Queryable = Pool | PoolClient;

const identityColumns = `u.id, u.role_id AS role, u.entra_tenant_id AS "tenantId",
  u.entra_object_id AS "objectId"`;
const auditActor = ({ tenantId, objectId }: EntraIdentity) => `${tenantId}:${objectId}`;
const eligible = `(u.role_id = 'administrador' OR EXISTS (
  SELECT 1 FROM central_bi.user_dashboards g
   JOIN central_bi.dashboards d ON d.id = g.dashboard_id AND d.active
  WHERE g.user_id = u.id AND g.permission_id = 'dashboard:read'
))`;
const validSession = `s.revoked_at IS NULL AND s.expires_at > now() AND s.idle_expires_at > now()`;

export async function writeAudit(
  db: Queryable, actor: string, event: string,
  details: Record<string, string | number | boolean> = {}, entityId = 0,
) {
  if (!actor.trim()) throw new Error("A auditoria exige o sujeito autenticado.");
  await db.query(
    "INSERT INTO central_bi.audit_logs(actor, action, entity_id, details) VALUES ($1,$2,$3,$4)",
    [actor, event, entityId, details],
  );
}

export async function lockAdministrator(
  client: PoolClient, hash: string, tenantId: string,
): Promise<SessionUser | undefined> {
  const { rows: [user] } = await client.query<SessionUser>(`
    SELECT ${identityColumns} FROM central_bi.sessions s
    JOIN central_bi.users u ON u.id = s.user_id
    WHERE s.token_hash=$1 AND ${validSession} AND u.enabled
      AND u.entra_tenant_id=$2 AND u.role_id='administrador'
    FOR SHARE OF u, s`, [hash, tenantId]);
  return user;
}

export class AccessDeniedError extends Error {}
export class AccessTargetError extends Error {}

export class PostgresIdentity {
  private readonly pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async storeAttempt(attempt: LoginAttempt) {
    const token = randomToken();
    await inTransaction(this.pool, async (client) => {
      await client.query("DELETE FROM central_bi.login_attempts WHERE expires_at <= now()");
      await client.query(`INSERT INTO central_bi.login_attempts
        (token_hash, state, nonce, code_verifier, expires_at)
        VALUES ($1,$2,$3,$4,now() + $5 * interval '1 second')`,
      [tokenHash(token), attempt.state, attempt.nonce, attempt.codeVerifier, loginSeconds]);
    });
    return token;
  }

  async consumeAttempt(token: string | undefined, state: string | null) {
    const hash = tokenHash(token);
    if (!hash || !state) return undefined;
    const { rows: [attempt] } = await this.pool.query<LoginAttempt>(`
      DELETE FROM central_bi.login_attempts WHERE token_hash=$1 AND state=$2 AND expires_at > now()
      RETURNING state, nonce, code_verifier AS "codeVerifier"`, [hash, state]);
    return attempt;
  }

  async login(identity: EntraIdentity, previousToken?: string) {
    return inTransaction(this.pool, async (client) => {
      const { rows: [user] } = await client.query<SessionUser>(`
        SELECT ${identityColumns} FROM central_bi.users u
        WHERE u.entra_tenant_id=$1 AND u.entra_object_id=$2 AND u.enabled AND ${eligible}
        FOR SHARE OF u`, [identity.tenantId, identity.objectId]);
      if (!user) {
        await writeAudit(client, auditActor(identity), "auth.denied");
        return null;
      }
      await client.query("DELETE FROM central_bi.sessions WHERE expires_at <= now()");
      const previousHash = tokenHash(previousToken);
      if (previousHash) await this.revokeToken(client, previousHash, "auth.replaced");
      const token = randomToken();
      await client.query(`INSERT INTO central_bi.sessions
        (token_hash, user_id, expires_at, idle_expires_at)
        VALUES ($1,$2,now() + $3 * interval '1 second',now() + $4 * interval '1 second')`,
      [tokenHash(token), user.id, sessionSeconds, idleSeconds]);
      await writeAudit(client, auditActor(user), "auth.login", { userId: user.id });
      return token;
    });
  }

  async revalidate(token: string | undefined, tenantId: string): Promise<PortalPrincipal | null> {
    const hash = tokenHash(token);
    if (!hash) return null;
    const { rows: [user] } = await this.pool.query<PortalPrincipal>(`
      UPDATE central_bi.sessions s
      SET idle_expires_at=LEAST(s.expires_at, now() + $3 * interval '1 second')
      FROM central_bi.users u
      WHERE s.user_id=u.id AND s.token_hash=$1 AND ${validSession}
        AND u.enabled AND u.entra_tenant_id=$2 AND ${eligible}
      RETURNING ${identityColumns}, ARRAY(
        SELECT d.slug FROM central_bi.user_dashboards g
        JOIN central_bi.dashboards d ON d.id=g.dashboard_id AND d.active
        WHERE g.user_id=u.id AND g.permission_id='dashboard:read'
      ) AS "dashboardSlugs"`, [hash, tenantId, idleSeconds]);
    return user ? { ...user, subject: auditActor(user) } : null;
  }

  async logout(token?: string) {
    const hash = tokenHash(token);
    if (hash) await inTransaction(this.pool, (client) => this.revokeToken(client, hash, "auth.logout"));
  }

  private async revokeToken(client: PoolClient, hash: string, event: string) {
    const { rows: [user] } = await client.query<SessionUser>(`
      UPDATE central_bi.sessions s SET revoked_at=now() FROM central_bi.users u
      WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.user_id=u.id
      RETURNING ${identityColumns}`, [hash]);
    if (user) await writeAudit(client, auditActor(user), event, { userId: user.id });
  }
}

export { auditActor };
