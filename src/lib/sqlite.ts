import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { Dashboard, DashboardInput, DashboardRepository } from "./domain";

export const schema = `
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS dashboards (
  id INTEGER PRIMARY KEY, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
  description TEXT NOT NULL, icon TEXT NOT NULL, category TEXT NOT NULL,
  display_order INTEGER NOT NULL, active INTEGER NOT NULL CHECK(active IN (0,1)),
  integration_type TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS roles (id TEXT PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, oidc_subject TEXT UNIQUE, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, role_id TEXT NOT NULL REFERENCES roles(id));
CREATE TABLE IF NOT EXISTS permissions (id TEXT PRIMARY KEY, description TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS role_permissions (role_id TEXT NOT NULL REFERENCES roles(id), permission_id TEXT NOT NULL REFERENCES permissions(id), PRIMARY KEY(role_id,permission_id));
CREATE TABLE IF NOT EXISTS user_dashboards (user_id TEXT NOT NULL REFERENCES users(id), dashboard_id INTEGER NOT NULL REFERENCES dashboards(id), permission_id TEXT NOT NULL REFERENCES permissions(id), PRIMARY KEY(user_id,dashboard_id,permission_id));
CREATE TABLE IF NOT EXISTS audit_logs (id INTEGER PRIMARY KEY, actor TEXT NOT NULL, action TEXT NOT NULL, entity_id INTEGER NOT NULL, created_at TEXT NOT NULL);
PRAGMA user_version = 1;
`;
type Row = {
  id: number;
  slug: string;
  name: string;
  description: string;
  icon: Dashboard["icon"];
  category: string;
  display_order: number;
  active: number;
  integration_type: Dashboard["integrationType"];
  created_at: string;
  updated_at: string;
};
function map(row: Row): Dashboard {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    icon: row.icon,
    category: row.category,
    displayOrder: row.display_order,
    active: row.active === 1,
    integrationType: row.integration_type,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
export class SqliteDashboardRepository implements DashboardRepository {
  readonly db: DatabaseSync;
  constructor(db: DatabaseSync) {
    this.db = db;
    db.exec(schema);
  }
  list(includeInactive = false) {
    return (
      this.db
        .prepare(
          `SELECT * FROM dashboards ${includeInactive ? "" : "WHERE active = 1"} ORDER BY display_order, name, id`,
        )
        .all() as Row[]
    ).map(map);
  }
  find(slug: string) {
    const row = this.db
      .prepare("SELECT * FROM dashboards WHERE slug = ?")
      .get(slug) as Row | undefined;
    return row ? map(row) : undefined;
  }
  listUsers() {
    return this.db
      .prepare(
        "SELECT users.id,users.name,users.email,roles.name AS role FROM users JOIN roles ON roles.id=users.role_id ORDER BY users.id",
      )
      .all() as { id: string; name: string; email: string; role: string }[];
  }
  listDemonstrativeGrants() {
    return this.db
      .prepare(
        "SELECT users.name,dashboards.name AS dashboard FROM user_dashboards JOIN users ON users.id=user_dashboards.user_id JOIN dashboards ON dashboards.id=user_dashboards.dashboard_id",
      )
      .all() as { name: string; dashboard: string }[];
  }
  private audit(action: string, id: number) {
    this.db
      .prepare(
        "INSERT INTO audit_logs(actor,action,entity_id,created_at) VALUES (?,?,?,?)",
      )
      .run("local-demo", action, id, new Date().toISOString());
  }
  create(input: DashboardInput) {
    const now = new Date().toISOString();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = this.db
        .prepare(
          "INSERT INTO dashboards(slug,name,description,icon,category,display_order,active,integration_type,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
        )
        .run(
          input.slug,
          input.name,
          input.description,
          input.icon,
          input.category,
          input.displayOrder,
          Number(input.active),
          input.integrationType,
          now,
          now,
        );
      this.audit("dashboard.created", Number(result.lastInsertRowid));
      this.db.exec("COMMIT");
      return this.find(input.slug)!;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  update(id: number, input: DashboardInput) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = this.db
        .prepare(
          "UPDATE dashboards SET slug=?,name=?,description=?,icon=?,category=?,display_order=?,active=?,integration_type=?,updated_at=? WHERE id=?",
        )
        .run(
          input.slug,
          input.name,
          input.description,
          input.icon,
          input.category,
          input.displayOrder,
          Number(input.active),
          input.integrationType,
          new Date().toISOString(),
          id,
        );
      if (result.changes) this.audit("dashboard.updated", id);
      this.db.exec("COMMIT");
      return result.changes ? this.find(input.slug) : undefined;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
}
export const demoDashboards: DashboardInput[] = [
  {
    slug: "comercial",
    name: "Dashboard Comercial",
    description:
      "Um espaço dedicado à visão comercial e ao acompanhamento do relacionamento com clientes.",
    icon: "chart",
    category: "Comercial",
    displayOrder: 10,
    active: true,
    integrationType: "pending",
  },
  {
    slug: "retencao-faturamento",
    name: "Dashboard de Retenção de Faturamento",
    description:
      "Uma visão integrada para acompanhar a retenção e apoiar as decisões da equipe.",
    icon: "shield",
    category: "Retenção",
    displayOrder: 20,
    active: true,
    integrationType: "pending",
  },
  {
    slug: "limite-global-cliente",
    name: "Dashboard de Limite Global por Cliente",
    description:
      "Um ponto de consulta para a futura visão consolidada de limites por cliente.",
    icon: "users",
    category: "Clientes",
    displayOrder: 30,
    active: true,
    integrationType: "pending",
  },
];
export function seed(repo: SqliteDashboardRepository) {
  // Versioned seed: a later rerun never overwrites edits or reintroduces renamed modules.
  repo.db.exec(
    "CREATE TABLE IF NOT EXISTS seed_metadata (version INTEGER PRIMARY KEY)",
  );
  if (
    repo.db.prepare("SELECT version FROM seed_metadata WHERE version=1").get()
  )
    return;
  for (const dashboard of demoDashboards)
    if (!repo.find(dashboard.slug)) repo.create(dashboard);
  repo.db.exec("BEGIN IMMEDIATE");
  try {
    for (const [id, name] of [
      ["administrador", "Administrador"],
      ["gestor", "Gestor"],
      ["visualizador", "Visualizador"],
    ])
      repo.db.prepare("INSERT OR IGNORE INTO roles VALUES (?,?)").run(id, name);
    for (const id of ["dashboard:read", "dashboard:manage", "users:manage"])
      repo.db
        .prepare("INSERT OR IGNORE INTO permissions VALUES (?,?)")
        .run(id, id);
    for (const permission of [
      "dashboard:read",
      "dashboard:manage",
      "users:manage",
    ])
      repo.db
        .prepare("INSERT OR IGNORE INTO role_permissions VALUES (?,?)")
        .run("administrador", permission);
    for (const role of ["gestor", "visualizador"])
      repo.db
        .prepare("INSERT OR IGNORE INTO role_permissions VALUES (?,?)")
        .run(role, "dashboard:read");
    for (const [id, name, email, role] of [
      [
        "demo-admin",
        "Pessoa Administradora",
        "admin@example.invalid",
        "administrador",
      ],
      ["demo-gestor", "Pessoa Gestora", "gestor@example.invalid", "gestor"],
      [
        "demo-viewer",
        "Pessoa Visualizadora",
        "visualizador@example.invalid",
        "visualizador",
      ],
    ])
      repo.db
        .prepare(
          "INSERT OR IGNORE INTO users(id,name,email,role_id) VALUES (?,?,?,?)",
        )
        .run(id, name, email, role);
    const first = repo.list()[0];
    if (first)
      repo.db
        .prepare("INSERT OR IGNORE INTO user_dashboards VALUES (?,?,?)")
        .run("demo-viewer", first.id, "dashboard:read");
    repo.db.prepare("INSERT INTO seed_metadata VALUES (1)").run();
    repo.db.exec("COMMIT");
  } catch (error) {
    repo.db.exec("ROLLBACK");
    throw error;
  }
}
let singleton: SqliteDashboardRepository | undefined;
export function getRepository() {
  if (
    process.env.NODE_ENV !== "development" ||
    process.env.LOCAL_DEMO_ENABLED !== "true"
  )
    throw new Error(
      "SQLite demonstrativo indisponível fora do desenvolvimento local.",
    );
  if (!singleton) {
    const path = resolve(
      process.env.LOCAL_SQLITE_PATH || ".local/central-bi.sqlite",
    );
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    singleton = new SqliteDashboardRepository(new DatabaseSync(path));
    seed(singleton);
  }
  return singleton;
}
