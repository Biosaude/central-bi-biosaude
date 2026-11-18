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

    await test.step("abre o Comercial autorizado e bloqueia os demais acessos e destinos", async () => {
      const commercialSlug = "painel-comercial-r1";
      const commercialUrl = "https://movopainelcomercial.vercel.app/";
      const route = origin + "/dashboards/" + commercialSlug;
      const commercial = await fixture.dashboards.create({
        slug: commercialSlug,
        name: "Dashboard Comercial",
        description: "Registro sintético com o identificador já utilizado na Central",
        icon: "chart",
        category: "Comercial",
        displayOrder: 30,
        active: true,
        integrationType: "pending",
      }, "fixture");
      await fixture.pool.query(`INSERT INTO central_bi.user_dashboards (user_id, dashboard_id, permission_id)
        VALUES ($1,$2,'dashboard:read')`, [firstUserId, commercial.id]);

      await page.goto(origin + "/dashboards");
      const card = page.locator("article", { has: page.getByRole("heading", { name: "Dashboard Comercial" }) });
      await card.getByRole("link", { name: "Explorar módulo" }).click();
      await expect(page).toHaveURL(route);
      const open = page.getByRole("link", { name: "Abrir Dashboard Comercial" });
      await expect(open).toHaveAttribute("href", commercialUrl);
      await expect(page.getByText(/A URL direta, as APIs e as RPCs do Comercial/)).toBeVisible();
      await expect(page.locator("iframe")).toHaveCount(0);

      const invalid = encodeURIComponent("https://evil.example.invalid/");
      await page.goto(`${route}?next=${invalid}&url=${invalid}&redirect=${invalid}`);
      await expect(open).toHaveAttribute("href", commercialUrl);
      const navigation = page.waitForRequest(commercialUrl);
      await page.route(commercialUrl, (intercept) => intercept.fulfill({ body: "Aplicativo Comercial simulado" }));
      await open.click();
      expect((await navigation).headers().referer).toBeUndefined();
      await expect(page).toHaveURL(commercialUrl);

      const anonymous = await browser.newContext();
      try {
        const publicPage = await anonymous.newPage();
        await publicPage.goto(route);
        await expect(publicPage.getByRole("heading", { name: "Acesso negado" })).toBeVisible();
        await expect(publicPage.getByRole("link", { name: "Abrir Dashboard Comercial" })).toHaveCount(0);
      } finally {
        await anonymous.close();
      }

      for (const unauthorized of [beta, admin]) {
        const response = await unauthorized.request.get(route, { maxRedirects: 0 });
        expect(response.status()).toBe(404);
        expect(await response.text()).not.toContain(commercialUrl);
      }

      await page.goto(origin + "/dashboards/acesso-alfa?slug=" + commercialSlug);
      await expect(open).toHaveCount(0);
      await fixture.pool.query("UPDATE central_bi.dashboards SET active=false WHERE id=$1", [commercial.id]);
      const inactive = await alpha.request.get(route, { maxRedirects: 0 });
      expect(inactive.status()).toBe(404);
      expect(await inactive.text()).not.toContain(commercialUrl);
    });

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
