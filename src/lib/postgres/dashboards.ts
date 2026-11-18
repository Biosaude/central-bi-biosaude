import type { Pool, PoolClient } from "pg";
import type { Dashboard, DashboardInput, DashboardRepository } from "../domain.ts";

import { inTransaction } from "./transaction.ts";
import { writeAudit } from "./identity.ts";

type WriteActor = string | ((client: PoolClient) => Promise<string>);

type ReadMethods = Pick<DashboardRepository, "list" | "find">;
type AsyncReadMethods = {
  [K in keyof ReadMethods]: (
    ...args: Parameters<ReadMethods[K]>
  ) => Promise<ReturnType<ReadMethods[K]>>;
};

type DashboardRow = Omit<Dashboard, "createdAt" | "updatedAt"> & {
  createdAt: Date;
  updatedAt: Date;
};

const columns = `id, slug, name, description, icon, category,
  display_order AS "displayOrder", active, integration_type AS "integrationType",
  created_at AS "createdAt", updated_at AS "updatedAt"`;

function toDashboard(row: DashboardRow): Dashboard {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function dashboardValues(input: DashboardInput) {
  return [
    input.slug, input.name, input.description, input.icon, input.category,
    input.displayOrder, input.active, input.integrationType,
  ];
}

export class PostgresDashboardRepository implements AsyncReadMethods {
  constructor(private readonly pool: Pool) {}

  async list(includeInactive = false): Promise<Dashboard[]> {
    const { rows } = await this.pool.query<DashboardRow>(
      `SELECT ${columns} FROM central_bi.dashboards
       WHERE ($1::boolean OR active) ORDER BY display_order, name, id`,
      [includeInactive],
    );
    return rows.map(toDashboard);
  }

  async find(slug: string): Promise<Dashboard | undefined> {
    const { rows: [row] } = await this.pool.query<DashboardRow>(
      `SELECT ${columns} FROM central_bi.dashboards WHERE slug = $1`,
      [slug],
    );
    return row && toDashboard(row);
  }

  async listGranted(userId: string, slug?: string): Promise<Dashboard[]> {
    const { rows } = await this.pool.query<DashboardRow>(
      `SELECT ${columns} FROM central_bi.dashboards
       WHERE active AND ($2::text IS NULL OR slug=$2)
         AND EXISTS (SELECT 1 FROM central_bi.user_dashboards g
           WHERE g.user_id=$1 AND g.dashboard_id=dashboards.id AND g.permission_id='dashboard:read')
       ORDER BY display_order, name, id`,
      [userId, slug ?? null],
    );
    return rows.map(toDashboard);
  }

  async create(input: DashboardInput, actor: WriteActor): Promise<Dashboard> {
    return inTransaction(this.pool, async (client) => {
      const subject = typeof actor === "function" ? await actor(client) : actor;
      const { rows: [row] } = await client.query<DashboardRow>(
        `INSERT INTO central_bi.dashboards
         (slug, name, description, icon, category, display_order, active, integration_type)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING ${columns}`,
        dashboardValues(input),
      );
      await writeAudit(client, subject, "dashboard.created", {}, row.id);
      return toDashboard(row);
    });
  }

  async update(id: number, input: DashboardInput, actor: WriteActor): Promise<Dashboard | undefined> {
    return inTransaction(this.pool, async (client) => {
      const subject = typeof actor === "function" ? await actor(client) : actor;
      const { rows: [row] } = await client.query<DashboardRow>(
        `UPDATE central_bi.dashboards
         SET slug = $1, name = $2, description = $3, icon = $4, category = $5,
             display_order = $6, active = $7, integration_type = $8, updated_at = now()
         WHERE id = $9 RETURNING ${columns}`,
        [...dashboardValues(input), id],
      );
      if (!row) return undefined;
      await writeAudit(client, subject, "dashboard.updated", {}, id);
      return toDashboard(row);
    });
  }
}
