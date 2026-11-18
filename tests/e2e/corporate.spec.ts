import { expect, test } from "@playwright/test";
import {
  adminObjectId, firstObjectId, firstUserId, prepareCorporateFixture, secondObjectId, tenantId,
} from "../fixtures/corporate";

const origin = "http://localhost:3004";
const cookieName = "central-bi-local-session";

test("isola dashboards e aplica revogação, gestão e logout nas rotas reais", async ({ browser }) => {
  const fixture = await prepareCorporateFixture(process.env.PG_CORPORATE_E2E_DATABASE_URL!, "central_bi_e2e_local");
  const alpha = await browser.newContext();
  const beta = await browser.newContext();
  const admin = await browser.newContext();
  try {
    for (const [context, objectId] of [[alpha, firstObjectId], [beta, secondObjectId], [admin, adminObjectId]] as const) {
      const value = await fixture.identity.login({ tenantId, objectId });
      expect(value).toBeTruthy();
      await context.addCookies([{ name: cookieName, value: value!, url: origin, httpOnly: true, sameSite: "Lax" }]);
    }
    expect((await alpha.request.get(origin + "/api/dashboards")).status()).toBe(200);
    expect((await (await alpha.request.get(origin + "/api/dashboards")).json()).map((d: { slug: string }) => d.slug))
      .toEqual(["acesso-alfa"]);
    expect((await (await beta.request.get(origin + "/api/dashboards")).json()).map((d: { slug: string }) => d.slug))
      .toEqual(["acesso-beta"]);
    expect((await alpha.request.post(origin + "/api/dashboards", { data: {}, headers: { Origin: origin } })).status()).toBe(403);
    expect((await admin.request.post(origin + "/api/dashboards", { data: {}, headers: { Origin: "https://example.invalid" } })).status()).toBe(403);
    expect((await alpha.request.post(origin + "/api/admin/access", {
      form: { action: "revoke", userId: firstUserId }, headers: { Origin: origin },
    })).status()).toBe(403);
    expect((await alpha.request.get(origin + "/dashboards/acesso-beta")).status()).toBe(404);
    expect((await admin.request.get(origin + "/dashboards/acesso-alfa")).status()).toBe(404);

    const page = await alpha.newPage();
    await page.goto(origin + "/dashboards");
    await expect(page.getByRole("heading", { name: "Painel Alfa" })).toBeVisible();
    await expect(page.getByText("Painel Beta")).toHaveCount(0);
    await page.goto(origin + "/gerenciamento/usuarios");
    await expect(page.getByRole("heading", { name: "Acesso negado" })).toBeVisible();

    const administrator = await admin.newPage();
    await administrator.goto(origin + "/gerenciamento/usuarios");
    const alphaCard = administrator.locator("section", { has: administrator.getByRole("heading", { name: "Pessoa Alfa", exact: true }) });
    const betaGrant = alphaCard.locator("form.grant-row", { hasText: "Painel Beta" });
    await betaGrant.getByRole("button", { name: "Conceder leitura" }).click();
    await expect(betaGrant.getByRole("button", { name: "Remover acesso" })).toBeVisible();
    expect((await alpha.request.get(origin + "/dashboards/acesso-beta")).status()).toBe(200);
    await alphaCard.getByRole("button", { name: "Revogar sessões" }).click();
    await expect.poll(async () => (await alpha.request.get(origin + "/api/dashboards")).status()).toBe(403);
    expect((await beta.request.get(origin + "/api/dashboards")).status()).toBe(200);

    const input = {
      slug: "escrita-corporativa", name: "Painel sintético", description: "Teste de gravação corporativa",
      icon: "chart", category: "Teste", displayOrder: 30, active: true, integrationType: "pending",
    };
    const create = await admin.request.post(origin + "/api/dashboards", {
      data: input, headers: { Origin: origin },
    });
    expect(create.status()).toBe(201);
    const { id } = await create.json();
    const update = await admin.request.put(origin + "/api/dashboards", {
      data: { ...input, id, active: false }, headers: { Origin: origin },
    });
    expect(update.status()).toBe(200);
    expect(await update.json()).toMatchObject({ id, active: false });
    expect((await beta.request.get(origin + "/dashboards/escrita-corporativa")).status()).toBe(404);

    await administrator.getByRole("button", { name: "Sair", exact: true }).click();
    await expect(administrator.getByRole("link", { name: "Entrar com Microsoft" })).toBeVisible();
    expect((await admin.request.get(origin + "/api/dashboards")).status()).toBe(403);
    expect((await admin.cookies()).some((cookie) => cookie.name === cookieName)).toBe(false);
    const audit = await fixture.pool.query("SELECT action, actor FROM central_bi.audit_logs ORDER BY id");
    expect(audit.rows).toEqual(expect.arrayContaining([
      { actor: `${tenantId}:${adminObjectId}`, action: "dashboard.created" },
      { actor: `${tenantId}:${adminObjectId}`, action: "dashboard.updated" },
    ]));
    expect(audit.rows.map((row) => row.action)).toEqual(expect.arrayContaining([
      "admin.grant.added", "admin.sessions.revoked", "auth.logout",
    ]));
  } finally {
    await Promise.all([alpha.close(), beta.close(), admin.close(), fixture.pool.end()]);
  }
});
