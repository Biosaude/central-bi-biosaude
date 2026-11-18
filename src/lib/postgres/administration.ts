import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import type { Role } from "../domain.ts";
import { AccessDeniedError, AccessTargetError, auditActor, lockAdministrator, writeAudit } from "./identity.ts";
import { inTransaction } from "./transaction.ts";

export type AdminAction =
  | { action: "user"; objectId: string; name: string; email: string; role: Role; enabled: boolean }
  | { action: "grant"; userId: string; dashboardId: number; granted: boolean }
  | { action: "revoke"; userId: string };

export async function manageAccess(
  pool: Pool, sessionHash: string, tenantId: string, command: AdminAction,
) {
  await inTransaction(pool, async (client) => {
    const admin = await lockAdministrator(client, sessionHash, tenantId);
    if (!admin) throw new AccessDeniedError();
    const actor = auditActor(admin);

    if (command.action === "user") {
      if (command.objectId === admin.objectId &&
          (!command.enabled || command.role !== "administrador")) {
        throw new AccessTargetError("Use outro administrador para alterar seu próprio acesso.");
      }
      const { rows: [inserted] } = await client.query<{ id: string }>(`
        INSERT INTO central_bi.users (id, entra_tenant_id, entra_object_id, name, email, role_id, enabled)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
        ON CONFLICT (entra_tenant_id, entra_object_id) DO NOTHING RETURNING id`,
      [randomUUID(), tenantId, command.objectId, command.name, command.email, command.role, command.enabled]);
      const details = { role: command.role, enabled: command.enabled };
      if (inserted) {
        await writeAudit(client, actor, "admin.user.created", { userId: inserted.id, ...details });
        return;
      }
      const { rows: [existing] } = await client.query<{ id: string; enabled: boolean; role: Role }>(`
        SELECT id, enabled, role_id AS role FROM central_bi.users
        WHERE entra_tenant_id=$1 AND entra_object_id=$2 FOR UPDATE`, [tenantId, command.objectId]);
      await client.query(`
        UPDATE central_bi.users SET name=$1, email=$2, role_id=$3, enabled=$4 WHERE id=$5`,
      [command.name, command.email, command.role, command.enabled, existing.id]);
      await writeAudit(client, actor, "admin.user.updated", { userId: existing.id, ...details });
      if (existing.enabled !== command.enabled || existing.role !== command.role) {
        await revokeSessions(client, actor, existing.id);
      }
      return;
    }

    const target = await client.query(`
      SELECT 1 FROM central_bi.users WHERE id=$1 AND entra_tenant_id=$2 FOR UPDATE`,
    [command.userId, tenantId]);
    if (!target.rowCount) throw new AccessTargetError("Usuário não encontrado.");

    if (command.action === "revoke") {
      if (command.userId === admin.id) throw new AccessTargetError("Use Sair para encerrar sua própria sessão.");
      await revokeSessions(client, actor, command.userId);
      return;
    }

    const dashboard = await client.query("SELECT 1 FROM central_bi.dashboards WHERE id=$1", [command.dashboardId]);
    if (!dashboard.rowCount) throw new AccessTargetError("Dashboard não encontrado.");
    const sql = command.granted
      ? `INSERT INTO central_bi.user_dashboards (user_id, dashboard_id, permission_id)
         VALUES ($1,$2,'dashboard:read') ON CONFLICT DO NOTHING`
      : `DELETE FROM central_bi.user_dashboards
         WHERE user_id=$1 AND dashboard_id=$2 AND permission_id='dashboard:read'`;
    const result = await client.query(sql, [command.userId, command.dashboardId]);
    if (result.rowCount) {
      await writeAudit(client, actor, command.granted ? "admin.grant.added" : "admin.grant.removed",
        { userId: command.userId }, command.dashboardId);
    }
  });
}

async function revokeSessions(db: PoolClient, actor: string, userId: string) {
  const result = await db.query(`
    UPDATE central_bi.sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL`, [userId]);
  await writeAudit(db, actor, "admin.sessions.revoked", { userId, count: result.rowCount ?? 0 });
}

export async function listManagedUsers(pool: Pool, tenantId: string) {
  const { rows } = await pool.query<{
    id: string; name: string; email: string; objectId: string; role: Role;
    enabled: boolean; dashboardIds: number[];
  }>(`
    SELECT u.id, u.name, u.email, u.entra_object_id AS "objectId", u.role_id AS role, u.enabled,
      ARRAY(SELECT g.dashboard_id FROM central_bi.user_dashboards g
        WHERE g.user_id=u.id AND g.permission_id='dashboard:read') AS "dashboardIds"
    FROM central_bi.users u WHERE u.entra_tenant_id=$1 ORDER BY u.name, u.id`, [tenantId]);
  return rows;
}
