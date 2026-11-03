import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import {
  SqliteDashboardRepository,
  seed,
  demoDashboards,
} from "../../src/lib/sqlite";
import {
  can,
  dashboardInput,
  denyByDefaultProvider,
} from "../../src/lib/domain";
import { isLocalDemo } from "../../src/lib/access";
import { isLocalRequest } from "../../scripts/local-boundary.mjs";

describe("Persistência local e catálogo dinâmico", () => {
  let db: DatabaseSync;
  let repo: SqliteDashboardRepository;
  beforeEach(() => {
    db = new DatabaseSync(":memory:");
    repo = new SqliteDashboardRepository(db);
    seed(repo);
  });
  afterEach(() => db.close());
  it("cadastra os três módulos fictícios e reutiliza o seed sem duplicação", () => {
    seed(repo);
    expect(repo.list().map((d) => d.slug)).toEqual([
      "comercial",
      "retencao-faturamento",
      "limite-global-cliente",
    ]);
    expect(db.prepare("SELECT count(*) AS n FROM users").get()?.n).toBe(3);
    expect(
      db.prepare("SELECT count(*) AS n FROM role_permissions").get()?.n,
    ).toBe(5);
    expect(
      db.prepare("SELECT count(*) AS n FROM user_dashboards").get()?.n,
    ).toBe(1);
  });
  it("cria, edita e ordena novos módulos sem alterações nas rotas", () => {
    const d = repo.create({
      ...demoDashboards[0],
      slug: "qualidade",
      name: "Qualidade assistencial",
      displayOrder: 1,
    });
    expect(repo.list()[0].slug).toBe("qualidade");
    const changed = repo.update(d.id, {
      ...demoDashboards[0],
      slug: "qualidade-nova",
      name: "Qualidade atualizada",
      displayOrder: 50,
    });
    expect(changed?.createdAt).toBe(d.createdAt);
    expect(changed?.updatedAt).toBeTruthy();
    expect(repo.find("qualidade")).toBeUndefined();
    expect(repo.list().at(-1)?.name).toBe("Qualidade atualizada");
  });
  it("desativa e reativa módulos; o catálogo público local omite inativos", () => {
    const d = repo.list()[0];
    repo.update(d.id, { ...demoDashboards[0], active: false });
    expect(repo.list()).toHaveLength(2);
    expect(repo.list(true)).toHaveLength(3);
    repo.update(d.id, demoDashboards[0]);
    expect(repo.list()).toHaveLength(3);
  });
  it("impõe identificadores únicos e auditoria transacional", () => {
    expect(() => repo.create(demoDashboards[0])).toThrow(/UNIQUE/);
    const d = repo.list()[0];
    repo.update(d.id, { ...demoDashboards[0], name: "Nome atualizado" });
    const logs = db.prepare("SELECT * FROM audit_logs").all();
    expect(logs).toHaveLength(4);
    expect(logs.at(-1)?.actor).toBe("local-demo");
    expect(logs.at(-1)?.action).toBe("dashboard.updated");
    expect(repo.update(999, demoDashboards[0])).toBeUndefined();
  });
  it("não recria módulos renomeados ou sobrescreve edições ao reiniciar", () => {
    const d = repo.find("comercial")!;
    repo.update(d.id, {
      ...demoDashboards[0],
      slug: "comercial-local",
      name: "Comercial editado",
      active: false,
    });
    seed(repo);
    expect(repo.find("comercial")).toBeUndefined();
    expect(repo.find("comercial-local")?.active).toBe(false);
    expect(repo.list(true)).toHaveLength(3);
  });
  it("valida formato, limites e rejeita URLs externas e campos desconhecidos", () => {
    expect(
      dashboardInput.safeParse({
        ...demoDashboards[0],
        slug: "https://example.com",
      }).success,
    ).toBe(false);
    expect(
      dashboardInput.safeParse({
        ...demoDashboards[0],
        externalUrl: "https://example.com",
      }).success,
    ).toBe(false);
    expect(
      dashboardInput.safeParse({ ...demoDashboards[0], displayOrder: -1 })
        .success,
    ).toBe(false);
    expect(
      dashboardInput.safeParse({
        ...demoDashboards[0],
        icon: "javascript:alert(1)",
      }).success,
    ).toBe(false);
  });
  it("contém apenas conteúdo demonstrativo, sem métricas financeiras ou fontes externas", () => {
    const serialized = JSON.stringify(repo.list(true));
    expect(serialized).not.toMatch(/https?:|R\$|receita real|iframe/i);
    expect(repo.list().every((d) => d.integrationType === "pending")).toBe(
      true,
    );
    const users = db.prepare("SELECT email,oidc_subject FROM users").all();
    expect(
      users.every(
        (u) =>
          String(u.email).endsWith("@example.invalid") &&
          u.oidc_subject === null,
      ),
    ).toBe(true);
  });
});

describe("Autorização com negação por padrão", () => {
  afterEach(() => vi.unstubAllEnvs());
  const token = "a".repeat(64);
  const trusted = new Headers({ "x-local-demo-gate": token });
  it("não fornece identidade nem concede acesso sem principal verificado", async () => {
    expect(await denyByDefaultProvider.getVerifiedPrincipal()).toBeNull();
    expect(can(null, "dashboard:read", "comercial")).toBe(false);
    expect(can(null, "users:manage")).toBe(false);
  });
  it("exige concessão individual e reserva gestão ao administrador", () => {
    for (const role of ["gestor", "visualizador", "administrador"] as const) {
      const principal = {
        subject: "oidc-verified-subject",
        role,
        dashboardSlugs: ["comercial"],
      };
      expect(can(principal, "dashboard:read", "comercial")).toBe(true);
      expect(can(principal, "dashboard:read", "retencao-faturamento")).toBe(
        false,
      );
      expect(can(principal, "dashboard:manage")).toBe(role === "administrador");
      expect(can(principal, "users:manage")).toBe(role === "administrador");
    }
  });
  it("só habilita demonstração com desenvolvimento, opt-in e selo interno do servidor", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("LOCAL_DEMO_ENABLED", "true");
    vi.stubEnv("LOCAL_GATE_TOKEN", token);
    expect(isLocalDemo(trusted)).toBe(true);
    expect(isLocalDemo(new Headers())).toBe(false);
    expect(isLocalDemo(new Headers({ "x-local-demo-gate": "forjado" }))).toBe(
      false,
    );
    vi.stubEnv("LOCAL_DEMO_ENABLED", "false");
    expect(isLocalDemo(trusted)).toBe(false);
    vi.stubEnv("LOCAL_DEMO_ENABLED", "true");
    vi.stubEnv("NODE_ENV", "production");
    expect(isLocalDemo(trusted)).toBe(false);
    vi.stubEnv("NODE_ENV", "test");
    expect(isLocalDemo(trusted)).toBe(false);
  });
  it("nega peers externos, proxy, Host forjado e requisições entre origens", () => {
    const request = {
      socket: { remoteAddress: "127.0.0.1" },
      headers: {
        host: "127.0.0.1:3000",
        origin: "http://127.0.0.1:3000",
      } as Record<string, string>,
      method: "POST",
    };
    expect(isLocalRequest(request, 3000)).toBe(true);
    expect(
      isLocalRequest(
        { ...request, socket: { remoteAddress: "192.0.2.1" } },
        3000,
      ),
    ).toBe(false);
    expect(
      isLocalRequest(
        {
          ...request,
          headers: { ...request.headers, host: "public.example.com" },
        },
        3000,
      ),
    ).toBe(false);
    expect(
      isLocalRequest(
        {
          ...request,
          headers: { ...request.headers, "x-forwarded-for": "127.0.0.1" },
        },
        3000,
      ),
    ).toBe(false);
    expect(
      isLocalRequest(
        {
          ...request,
          headers: { ...request.headers, forwarded: "for=127.0.0.1" },
        },
        3000,
      ),
    ).toBe(false);
    expect(
      isLocalRequest(
        { ...request, headers: { host: request.headers.host } },
        3000,
      ),
    ).toBe(false);
    expect(
      isLocalRequest(
        {
          ...request,
          headers: { ...request.headers, origin: "https://evil.example" },
        },
        3000,
      ),
    ).toBe(false);
    expect(
      isLocalRequest(
        {
          ...request,
          headers: { ...request.headers, "sec-fetch-site": "cross-site" },
        },
        3000,
      ),
    ).toBe(false);
  });
});
