import { expect, it } from "vitest";
import { manageAccess } from "../../src/lib/postgres/administration";
import { AccessDeniedError, tokenHash } from "../../src/lib/postgres/identity";
import {
  adminObjectId, firstObjectId, firstUserId, noGrantObjectId, prepareCorporateFixture,
  secondObjectId, tenantId,
} from "../fixtures/corporate";

const connection = process.env.PG_AUTH_TEST_DATABASE_URL;

it.skipIf(!connection)("isola usuários, revalida permissões e encerra sessões no PostgreSQL", async () => {
  const { pool, identity, dashboards, first, second } =
    await prepareCorporateFixture(connection!, "central_bi_auth_local");
  try {
    const attempt = { state: "estado", nonce: "nonce", codeVerifier: "verificador" };
    const browser = await identity.storeAttempt(attempt);
    expect(await identity.consumeAttempt(undefined, attempt.state)).toBeUndefined();
    expect(await identity.consumeAttempt(browser, "incorreto")).toBeUndefined();
    const attempts = await Promise.all([
      identity.consumeAttempt(browser, attempt.state), identity.consumeAttempt(browser, attempt.state),
    ]);
    expect(attempts.filter(Boolean)).toEqual([attempt]);
    const expiredAttempt = await identity.storeAttempt(attempt);
    await pool.query("UPDATE central_bi.login_attempts SET expires_at=now() WHERE token_hash=$1", [tokenHash(expiredAttempt)]);
    expect(await identity.consumeAttempt(expiredAttempt, attempt.state)).toBeUndefined();

    const sameEmail = { tenantId, objectId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", email: "alfa@example.invalid" };
    expect(await identity.login(sameEmail)).toBeNull();
    expect(await identity.login({ tenantId, objectId: noGrantObjectId })).toBeNull();
    expect(await identity.login({ tenantId: firstObjectId, objectId: firstObjectId })).toBeNull();

    const admin = (await identity.login({ tenantId, objectId: adminObjectId }))!;
    const alpha = (await identity.login({ tenantId, objectId: firstObjectId }))!;
    const beta = (await identity.login({ tenantId, objectId: secondObjectId }))!;
    expect(await identity.revalidate(alpha, firstObjectId)).toBeNull();
    expect(await identity.revalidate(alpha, tenantId)).toMatchObject({
      id: firstUserId, dashboardSlugs: [first.slug], role: "visualizador",
    });
    expect(await dashboards.listGranted(firstUserId, second.slug)).toEqual([]);
    expect(await identity.revalidate(beta, tenantId)).toMatchObject({ dashboardSlugs: [second.slug] });
    expect(await identity.revalidate(admin, tenantId)).toMatchObject({ dashboardSlugs: [], role: "administrador" });

    const hash = tokenHash(alpha)!;
    const persisted = await pool.query("SELECT token_hash FROM central_bi.sessions WHERE user_id=$1", [firstUserId]);
    expect(persisted.rows).toEqual([{ token_hash: hash }]);
    expect(hash).not.toBe(alpha);
    await expect(manageAccess(pool, hash, tenantId,
      { action: "grant", userId: firstUserId, dashboardId: second.id, granted: true },
    )).rejects.toBeInstanceOf(AccessDeniedError);

    const adminHash = tokenHash(admin)!;
    await manageAccess(pool, adminHash, tenantId,
      { action: "grant", userId: firstUserId, dashboardId: second.id, granted: true });
    expect((await dashboards.listGranted(firstUserId)).map((dashboard) => dashboard.id)).toEqual([first.id, second.id]);
    await manageAccess(pool, adminHash, tenantId,
      { action: "grant", userId: firstUserId, dashboardId: first.id, granted: false });
    expect((await identity.revalidate(alpha, tenantId))?.dashboardSlugs).toEqual([second.slug]);
    await manageAccess(pool, adminHash, tenantId,
      { action: "grant", userId: firstUserId, dashboardId: second.id, granted: false });
    expect(await identity.revalidate(alpha, tenantId)).toBeNull();

    await pool.query("UPDATE central_bi.sessions SET idle_expires_at=now() WHERE token_hash=$1", [tokenHash(beta)]);
    expect(await identity.revalidate(beta, tenantId)).toBeNull();
    const absolute = await identity.login({ tenantId, objectId: secondObjectId });
    await pool.query("UPDATE central_bi.sessions SET expires_at=now() WHERE token_hash=$1", [tokenHash(absolute!)]);
    expect(await identity.revalidate(absolute!, tenantId)).toBeNull();

    const objectId = "ffffffff-ffff-4fff-8fff-ffffffffffff";
    const provision = {
      action: "user" as const, objectId, name: "Gestora Fictícia", email: "ficticia@example.invalid",
      role: "administrador" as const, enabled: true,
    };
    await manageAccess(pool, adminHash, tenantId, provision);
    const provisioned = await identity.login({ tenantId, objectId });
    expect(provisioned).toBeTruthy();
    await manageAccess(pool, adminHash, tenantId, { ...provision, enabled: false });
    expect(await identity.revalidate(provisioned!, tenantId)).toBeNull();

    const replaced = await identity.login({ tenantId, objectId: secondObjectId });
    const current = await identity.login({ tenantId, objectId: secondObjectId }, replaced!);
    expect(await identity.revalidate(replaced!, tenantId)).toBeNull();
    await identity.logout(current!);
    expect(await identity.revalidate(current!, tenantId)).toBeNull();

    const audit = await pool.query("SELECT action FROM central_bi.audit_logs ORDER BY id");
    expect(audit.rows.map(({ action }) => action)).toEqual(expect.arrayContaining([
      "auth.denied", "auth.login", "auth.logout", "auth.replaced", "admin.grant.added", "admin.grant.removed",
      "admin.user.created", "admin.user.updated", "admin.sessions.revoked",
    ]));
  } finally {
    await pool.end();
  }
});
