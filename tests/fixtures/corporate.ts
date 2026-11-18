import { createPostgresPool } from "../../src/lib/postgres/connection.ts";
import { PostgresDashboardRepository } from "../../src/lib/postgres/dashboards.ts";
import { PostgresIdentity } from "../../src/lib/postgres/identity.ts";
import { migratePostgres } from "../../src/lib/postgres/migrations.ts";

export const tenantId = "11111111-1111-4111-8111-111111111111";
export const clientId = "22222222-2222-4222-8222-222222222222";
export const adminObjectId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
export const firstObjectId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
export const secondObjectId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
export const noGrantObjectId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
export const adminUserId = "10000000-1111-4111-8111-111111111111";
export const firstUserId = "20000000-1111-4111-8111-111111111111";
export const secondUserId = "30000000-1111-4111-8111-111111111111";
const noGrantUserId = "40000000-1111-4111-8111-111111111111";

export function localTestPool(connection: string, database: string) {
  const url = new URL(connection);
  if (url.hostname !== "127.0.0.1" || url.pathname !== "/" + database || url.search) {
    throw new Error("O teste corporativo exige o PostgreSQL local e descartável.");
  }
  return createPostgresPool(connection);
}

export async function prepareCorporateFixture(connection: string, database: string) {
  const pool = localTestPool(connection, database);
  try {
    await migratePostgres(pool);
    for (const [id, objectId, name, email, role] of [
      [adminUserId, adminObjectId, "Admin de Teste", "admin@example.invalid", "administrador"],
      [firstUserId, firstObjectId, "Pessoa Alfa", "alfa@example.invalid", "visualizador"],
      [secondUserId, secondObjectId, "Pessoa Beta", "beta@example.invalid", "gestor"],
      [noGrantUserId, noGrantObjectId, "Sem Concessão", "sem@example.invalid", "visualizador"],
    ]) {
      await pool.query(`INSERT INTO central_bi.users (id, entra_tenant_id, entra_object_id, name, email, role_id, enabled)
        VALUES ($1,$2,$3,$4,$5,$6,true)`, [id, tenantId, objectId, name, email, role]);
    }
    const dashboards = new PostgresDashboardRepository(pool);
    const first = await dashboards.create({
      slug: "acesso-alfa", name: "Painel Alfa", description: "Dados fictícios do teste Alfa",
      icon: "chart", category: "Teste", displayOrder: 10, active: true, integrationType: "pending",
    }, "fixture");
    const second = await dashboards.create({
      slug: "acesso-beta", name: "Painel Beta", description: "Dados fictícios do teste Beta",
      icon: "chart", category: "Teste", displayOrder: 20, active: true, integrationType: "pending",
    }, "fixture");
    await pool.query(`INSERT INTO central_bi.user_dashboards (user_id, dashboard_id, permission_id)
      VALUES ($1,$2,'dashboard:read'), ($3,$4,'dashboard:read')`,
    [firstUserId, first.id, secondUserId, second.id]);
    return { pool, first, second, dashboards, identity: new PostgresIdentity(pool) };
  } catch (error) {
    await pool.end();
    throw error;
  }
}
