import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { manageAccess } from "../../src/lib/postgres/administration";
import { checkCommercialEntitlement, commercialDashboardSlug } from "../../src/lib/postgres/commercial-entitlement";
import { PostgresDashboardRepository } from "../../src/lib/postgres/dashboards";
import { PostgresIdentity, tokenHash } from "../../src/lib/postgres/identity";
import { migratePostgres } from "../../src/lib/postgres/migrations";
import {
  adminObjectId, firstObjectId, firstUserId, localTestPool, prepareCorporateFixture, tenantId,
} from "../fixtures/corporate";

const migration = process.env.PG_ROLE_TEST_MIGRATION_URL;
const runtime = process.env.PG_ROLE_TEST_RUNTIME_URL;

it.skipIf(!migration || !runtime)("executa com privilégios mínimos e bloqueia DDL e edição de auditoria", async () => {
  expect(new URL(migration!).username).toBe("central_bi_migrator");
  expect(new URL(runtime!).username).toBe("central_bi_runtime");
  const fixture = await prepareCorporateFixture(migration!, "neondb");
  const pool = localTestPool(runtime!, "neondb");
  try {
    const grants = await readFile(new URL("../../db/operations/homologacao-runtime.sql", import.meta.url), "utf8");
    await fixture.pool.query(grants);
    await fixture.pool.query(grants);
    const version = await pool.query("SHOW server_version_num");
    expect(Number(version.rows[0].server_version_num)).toBeGreaterThanOrEqual(180000);
    expect(Number(version.rows[0].server_version_num)).toBeLessThan(190000);
    expect((await pool.query("SELECT current_user")).rows).toEqual([{ current_user: "central_bi_runtime" }]);

    const identity = new PostgresIdentity(pool);
    const attempt = { state: "state", nonce: "nonce", codeVerifier: "verifier" };
    const handle = await identity.storeAttempt(attempt);
    expect(await identity.consumeAttempt(handle, attempt.state)).toEqual(attempt);
    const admin = await identity.login({ tenantId, objectId: adminObjectId });
    const viewer = await identity.login({ tenantId, objectId: firstObjectId });
    expect(await identity.revalidate(viewer!, tenantId)).toMatchObject({ dashboardSlugs: [fixture.first.slug] });
    const dashboards = new PostgresDashboardRepository(pool);
    expect((await dashboards.listGranted(firstUserId)).map(({ slug }) => slug)).toEqual([fixture.first.slug]);

    const hash = tokenHash(admin!)!;
    await manageAccess(pool, hash, tenantId, {
      action: "user", objectId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", name: "Pessoa de Teste",
      email: "exemplo@example.invalid", role: "visualizador", enabled: false,
    });
    await manageAccess(pool, hash, tenantId, {
      action: "grant", userId: firstUserId, dashboardId: fixture.second.id, granted: true,
    });
    expect(await identity.revalidate(viewer!, tenantId)).toMatchObject({
      dashboardSlugs: expect.arrayContaining([fixture.first.slug, fixture.second.slug]),
    });
    const { id, createdAt, updatedAt, ...initial } = fixture.first;
    const created = await dashboards.create({ ...initial, slug: "novo-sintetico" }, "fixture");
    await expect(dashboards.update(created.id, { ...initial, slug: created.slug, active: false }, "fixture"))
      .resolves.toMatchObject({ id: created.id, active: false });
    await manageAccess(pool, hash, tenantId, { action: "revoke", userId: firstUserId });
    expect(await identity.revalidate(viewer!, tenantId)).toBeNull();
    const commercial = await dashboards.create({ ...initial, slug: commercialDashboardSlug }, "fixture");
    const commercialGrant = { action: "grant" as const, userId: firstUserId, dashboardId: commercial.id };
    const assertion = (objectId = firstObjectId) => ({
      tenantId, objectId, jti: randomUUID(), expiresAt: Math.floor(Date.now() / 1000) + 30,
    });
    const lookup = (objectId?: string) => checkCommercialEntitlement(pool, assertion(objectId));

    expect(await lookup()).toEqual({ accepted: true, allowed: false });
    expect(await lookup(adminObjectId)).toEqual({ accepted: true, allowed: false });
    await manageAccess(pool, hash, tenantId, { ...commercialGrant, granted: true });
    const oneTime = assertion();
    const simultaneous = await Promise.all([
      checkCommercialEntitlement(pool, oneTime), checkCommercialEntitlement(pool, oneTime),
    ]);
    expect(simultaneous.filter(({ accepted }) => accepted)).toEqual([{ accepted: true, allowed: true }]);
    expect(simultaneous.filter(({ accepted }) => !accepted)).toEqual([{ accepted: false, allowed: false }]);

    await fixture.pool.query("UPDATE central_bi.users SET enabled=false WHERE id=$1", [firstUserId]);
    expect(await lookup()).toEqual({ accepted: true, allowed: false });
    await fixture.pool.query("UPDATE central_bi.users SET enabled=true WHERE id=$1", [firstUserId]);
    await dashboards.update(commercial.id, { ...initial, slug: commercialDashboardSlug, active: false }, "fixture");
    expect(await lookup()).toEqual({ accepted: true, allowed: false });
    await dashboards.update(commercial.id, { ...initial, slug: commercialDashboardSlug }, "fixture");
    expect(await lookup()).toEqual({ accepted: true, allowed: true });
    await manageAccess(pool, hash, tenantId, { ...commercialGrant, granted: false });
    expect(await lookup()).toEqual({ accepted: true, allowed: false });

    const expired = { ...assertion(), expiresAt: Math.floor(Date.now() / 1000) - 1 };
    await fixture.pool.query(
      "INSERT INTO central_bi.commercial_entitlement_assertions VALUES ($1, to_timestamp($2))",
      [expired.jti, expired.expiresAt],
    );
    expect(await checkCommercialEntitlement(pool, expired)).toEqual({ accepted: false, allowed: false });
    expect((await fixture.pool.query(
      "SELECT 1 FROM central_bi.commercial_entitlement_assertions WHERE jti=$1", [expired.jti],
    )).rowCount).toBe(0);
    await identity.logout(admin!);
    expect(await identity.revalidate(admin!, tenantId)).toBeNull();

    const audit = await fixture.pool.query("SELECT action FROM central_bi.audit_logs");
    expect(audit.rows.map(({ action }) => action)).toEqual(expect.arrayContaining([
      "auth.login", "auth.logout", "admin.sessions.revoked", "admin.grant.added",
      "dashboard.created", "dashboard.updated",
    ]));
    for (const denied of [
      "CREATE TABLE central_bi.forbidden (id int)", "CREATE TABLE public.forbidden (id int)",
      "CREATE TEMP TABLE forbidden (id int)", "CREATE SCHEMA forbidden",
      "SELECT * FROM central_bi.audit_logs", "UPDATE central_bi.audit_logs SET actor='x'",
      "DELETE FROM central_bi.audit_logs", "SELECT * FROM central_bi.schema_migrations",
      "UPDATE central_bi.users SET entra_object_id=NULL", "SET ROLE central_bi_migrator",
      "SELECT jti FROM central_bi.commercial_entitlement_assertions",
      "UPDATE central_bi.commercial_entitlement_assertions SET expires_at=now()",
    ]) {
      await expect(pool.query(denied)).rejects.toMatchObject({ code: "42501" });
    }
    await expect(migratePostgres(pool)).rejects.toMatchObject({ code: "42501" });
    await expect(migratePostgres(fixture.pool)).resolves.toEqual([]);
  } finally {
    await Promise.all([pool.end(), fixture.pool.end()]);
  }
});
