import { test, expect } from "@playwright/test";

test("renderiza o portal e navega pelas páginas previstas", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      name: "Uma visão central. Novas possibilidades.",
    }),
  ).toBeVisible();
  await expect(page.getByRole("contentinfo")).toContainText("Dados fictícios");
  await page.screenshot({
    path: "test-results/portal-desktop.png",
    fullPage: true,
  });
  for (const [label, title] of [
    ["Catálogo de dashboards", "Catálogo de dashboards"],
    ["Usuários e permissões", "Usuários e permissões"],
    ["Configurações", "Configurações"],
  ] as const) {
    await page
      .getByRole("navigation", { name: "Navegação principal" })
      .getByRole("link", { name: label, exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
  }
  await page.goto("/acesso-negado");
  await expect(
    page.getByRole("heading", { name: "Acesso negado" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("cadastra, edita, ordena, desativa e reativa um dashboard dinâmico", async ({
  page,
}) => {
  await page.goto("/gerenciamento/dashboards");
  await page
    .getByRole("button", { name: "Novo dashboard", exact: true })
    .click();
  await page
    .getByLabel("Nome do dashboard", { exact: true })
    .fill("Dashboard de Qualidade");
  await page.getByLabel("Identificador único").fill("qualidade-local");
  await page
    .getByLabel("Descrição", { exact: true })
    .fill("Módulo fictício de qualidade para testes locais.");
  await page.getByLabel("Categoria", { exact: true }).fill("Qualidade");
  await page.getByLabel("Ordem de exibição").fill("1");
  await page
    .getByRole("button", { name: "Salvar dashboard", exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText(
    "Dashboard salvo com sucesso.",
  );
  await expect(page.getByRole("row").nth(1)).toContainText(
    "Dashboard de Qualidade",
  );
  await page.goto("/dashboards");
  await expect(page.locator(".dashboard-card").first()).toContainText(
    "Dashboard de Qualidade",
  );
  await page.getByLabel("Buscar dashboard").fill("Qualidade");
  await expect(page.locator(".dashboard-card")).toHaveCount(1);
  await page.getByRole("link", { name: "Explorar módulo" }).click();
  await expect(page).toHaveURL(/\/dashboards\/qualidade-local$/);
  await expect(
    page.getByRole("heading", { name: "Dashboard de Qualidade", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Integração pendente", { exact: true }),
  ).toBeVisible();
  await page.goto("/gerenciamento/dashboards");
  await page
    .getByRole("button", { name: "Editar Dashboard de Qualidade", exact: true })
    .click();
  await page
    .getByLabel("Nome do dashboard", { exact: true })
    .fill("Qualidade atualizada");
  await page.getByLabel("Ordem de exibição").fill("99");
  await page
    .getByRole("button", { name: "Salvar dashboard", exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText(
    "Dashboard salvo com sucesso.",
  );
  await expect(page.getByRole("row").last()).toContainText(
    "Qualidade atualizada",
  );
  await page
    .getByRole("button", {
      name: "Desativar Qualidade atualizada",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("row").filter({ hasText: "Qualidade atualizada" }),
  ).toContainText("Inativo");
  await expect(
    page
      .getByRole("navigation", { name: "Módulos ativos" })
      .getByRole("link", { name: "Qualidade atualizada" }),
  ).toHaveCount(0);
  const inactive = await page.goto("/dashboards/qualidade-local");
  expect(inactive?.status()).toBe(404);
  await page.goto("/dashboards");
  await expect(
    page.locator(".dashboard-card").filter({ hasText: "Qualidade atualizada" }),
  ).toHaveCount(0);
  await page.goto("/gerenciamento/dashboards");
  await page
    .getByRole("button", { name: "Ativar Qualidade atualizada", exact: true })
    .click();
  await expect(
    page.getByRole("row").filter({ hasText: "Qualidade atualizada" }),
  ).toContainText("Ativo");
  await page.goto("/dashboards/qualidade-local");
  await expect(
    page.getByRole("heading", { name: "Qualidade atualizada", exact: true }),
  ).toBeVisible();
});

test("valida duplicidade, campos inesperados e erros sem acionar recursos externos", async ({
  request,
}) => {
  const input = {
    slug: "comercial",
    name: "Dashboard duplicado",
    description: "Descrição demonstrativa.",
    icon: "chart",
    category: "Teste",
    displayOrder: 1,
    active: true,
    integrationType: "pending",
  };
  const duplicate = await request.post("/api/dashboards", {
    headers: { Origin: "http://127.0.0.1:3000" },
    data: input,
  });
  expect(duplicate.status()).toBe(409);
  const url = await request.post("/api/dashboards", {
    headers: { Origin: "http://127.0.0.1:3000" },
    data: { ...input, externalUrl: "https://example.com" },
  });
  expect(url.status()).toBe(400);
  const missing = await request.put("/api/dashboards", {
    headers: { Origin: "http://127.0.0.1:3000" },
    data: { ...input, id: 99999, slug: "inexistente" },
  });
  expect(missing.status()).toBe(404);
  const invalid = await request.post("/api/dashboards", {
    headers: {
      Origin: "http://127.0.0.1:3000",
      "Content-Type": "application/json",
    },
    data: "null",
  });
  expect(invalid.status()).toBe(400);
});

test("bloqueia CSRF, proxy e tentativa de forjar autorização", async ({
  request,
}) => {
  const attempts: Record<string, string>[] = [
    { Origin: "https://evil.example" },
    { "x-forwarded-for": "127.0.0.1" },
    { "x-local-demo-gate": "forjado" },
  ];
  for (const headers of attempts) {
    const response = await request.post("/api/dashboards", {
      headers,
      data: {},
    });
    expect(response.status()).toBe(403);
  }
  const forwarded = await request.get("/api/dashboards", {
    headers: { forwarded: "for=127.0.0.1" },
  });
  expect(forwarded.status()).toBe(403);
});

test("nega administração e leitura demonstrativa em produção mesmo com opt-in", async ({
  request,
  page,
}) => {
  for (const method of ["get", "post", "put"] as const) {
    const response = await request[method](
      "http://127.0.0.1:3002/api/dashboards",
      {
        headers: {
          Origin: "http://127.0.0.1:3002",
          "x-local-demo-gate": "b".repeat(64),
        },
        ...(method === "get" ? {} : { data: {} }),
      },
    );
    expect(response.status()).toBe(403);
  }
  for (const route of [
    "/",
    "/gerenciamento/dashboards",
    "/gerenciamento/usuarios",
    "/dashboards/comercial",
    "/configuracoes",
  ]) {
    await page.goto(`http://127.0.0.1:3002${route}`);
    await expect(
      page.getByRole("heading", { name: "Acesso negado" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Novo dashboard" }),
    ).toHaveCount(0);
    await expect(page.getByText("admin@example.invalid")).toHaveCount(0);
  }
});

test("os módulos iniciais são placeholders sem dados financeiros, iframes ou chamadas externas", async ({
  page,
}) => {
  const external: string[] = [];
  page.on("request", (r) => {
    if (
      !r.url().startsWith("http://127.0.0.1:3000") &&
      !r.url().startsWith("data:")
    )
      external.push(r.url());
  });
  for (const slug of [
    "comercial",
    "retencao-faturamento",
    "limite-global-cliente",
  ]) {
    await page.goto(`/dashboards/${slug}`);
    await expect(
      page.getByText("Integração pendente", { exact: true }),
    ).toBeVisible();
    await expect(page.locator("iframe")).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText("R$");
  }
  expect(external).toEqual([]);
  const response = await page.goto("/dashboards/modulo-inexistente");
  expect(response?.status()).toBe(404);
});

test("adapta a navegação e o conteúdo à tela de celular", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/portal-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Abrir menu" }).click();
  await page
    .getByRole("navigation", { name: "Navegação principal" })
    .getByRole("link", { name: "Catálogo de dashboards" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Catálogo de dashboards" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Abrir menu" }),
  ).toHaveAttribute("aria-expanded", "false");
  for (const path of [
    "/dashboards",
    "/gerenciamento/dashboards",
    "/gerenciamento/usuarios",
    "/configuracoes",
  ]) {
    await page.goto(path);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
});
