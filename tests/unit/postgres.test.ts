import { describe, expect, it } from "vitest";
import type { DashboardInput } from "../../src/lib/domain";
import { createPostgresPool } from "../../src/lib/postgres/connection";
import { PostgresDashboardRepository } from "../../src/lib/postgres/dashboards";
import { migratePostgres } from "../../src/lib/postgres/migrations";

const connection = process.env.PG_TEST_DATABASE_URL;
const fixture: DashboardInput = {
  slug: "teste-sintetico",
  name: "Painel sintético",
  description: "Dados fictícios para teste de persistência",
  icon: "chart",
  category: "Homologação",
  displayOrder: 10,
  active: true,
  integrationType: "pending",
};

describe("PostgreSQL local", () => {
  it.skipIf(!connection)("migra, persiste e audita no PostgreSQL 18", async () => {
    const url = new URL(connection!);
    expect(url.hostname).toBe("127.0.0.1");
    expect(url.pathname).toBe("/central_bi_local");
    expect(url.search).toBe("");
    const pool = createPostgresPool(connection);
    try {
      const { rows: [{ server_version_num: version }] } = await pool.query("SHOW server_version_num");
      expect(Number(version)).toBeGreaterThanOrEqual(180000);
      expect(Number(version)).toBeLessThan(190000);
      const migrations = await Promise.all([migratePostgres(pool), migratePostgres(pool)]);
      expect(migrations.flat()).toEqual(["001_initial.sql", "002_corporate_access.sql", "003_commercial_entitlement_replay.sql"]);
      await expect(migratePostgres(pool)).resolves.toEqual([]);

      const repository = new PostgresDashboardRepository(pool);
      await expect(repository.list(true)).resolves.toEqual([]);
      const actor = "oidc:test-subject";
      const dashboard = await repository.create(fixture, actor);
      await expect(repository.find(fixture.slug)).resolves.toEqual(dashboard);
      await expect(repository.create(fixture, actor)).rejects.toMatchObject({ code: "23505" });

      await expect(repository.update(dashboard.id, { ...fixture, active: false }, " ")).rejects.toThrow();
      await expect(repository.find(fixture.slug)).resolves.toEqual(dashboard);
      await expect(repository.update(dashboard.id, { ...fixture, active: false }, actor))
        .resolves.toMatchObject({ id: dashboard.id, active: false });
      await expect(repository.list()).resolves.toEqual([]);
      await expect(repository.list(true)).resolves.toHaveLength(1);
      await expect(repository.update(dashboard.id + 1000, fixture, actor)).resolves.toBeUndefined();
      const audit = await pool.query("SELECT actor, action FROM central_bi.audit_logs ORDER BY id");
      expect(audit.rows).toEqual([
        { actor, action: "dashboard.created" },
        { actor, action: "dashboard.updated" },
      ]);
    } finally {
      await pool.end();
    }
  });
});
