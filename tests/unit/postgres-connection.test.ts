import { afterEach, expect, it, vi } from "vitest";
import { createMigrationPool, createPostgresPool } from "../../src/lib/postgres/connection";

const host = "ep-quiet-bird-b6xxmzh7.c-2.sa-east-1.aws.neon.tech";
const url = (role: string, query = "?sslmode=verify-full") =>
  `postgresql://${role}:fixture-only@${host}/neondb${query}`;

afterEach(() => vi.unstubAllEnvs());

it("exige o endpoint exato, TLS verificado e o papel correspondente", async () => {
  const options = { host, database: "neondb", ssl: { rejectUnauthorized: true }, enableChannelBinding: true };
  const runtime = createPostgresPool(url("central_bi_runtime"));
  const migration = createPostgresPool(url("central_bi_migrator"), "migration");
  try {
    expect(runtime).toMatchObject({ options: { ...options, user: "central_bi_runtime" } });
    expect(migration).toMatchObject({ options: { ...options, user: "central_bi_migrator" } });
  } finally {
    await Promise.all([runtime.end(), migration.end()]);
  }
  expect(() => createPostgresPool(url("central_bi_migrator"))).toThrow();
  expect(() => createPostgresPool(url("central_bi_runtime"), "migration")).toThrow();
  expect(() => createPostgresPool(url("central_bi_runtime", ""))).toThrow();
  expect(() => createPostgresPool(url("central_bi_runtime", "?sslmode=require"))).toThrow();
  expect(() => createPostgresPool(url("central_bi_runtime", "?sslmode=verify-full&sslmode=disable"))).toThrow();
  expect(() => createPostgresPool(url("central_bi_runtime", "?sslmode=verify-full&host=wrong.example.invalid"))).toThrow();
  expect(() => createPostgresPool(url("central_bi_runtime").replace(host, "wrong.example.invalid"))).toThrow();
  expect(() => createPostgresPool(url("central_bi_runtime").replace("/neondb", "/other_db"))).toThrow();
});

it("mantém a conexão local e nunca usa a URL da aplicação para migrar", async () => {
  const local = "postgresql://postgres@127.0.0.1:15432/central_bi_local";
  vi.stubEnv("DATABASE_URL", local);
  vi.stubEnv("MIGRATION_DATABASE_URL", undefined);
  expect(() => createMigrationPool()).toThrow("MIGRATION_DATABASE_URL");
  vi.stubEnv("MIGRATION_DATABASE_URL", local);
  const pool = createMigrationPool();
  try {
    expect(pool).toMatchObject({ options: { host: "127.0.0.1", port: 15432, ssl: false } });
  } finally {
    await pool.end();
  }
});

it("Production exige um Neon operacional explícito e rejeita alvos de homologação", async () => {
  const productionHost = "ep-operacional.c-2.sa-east-1.aws.neon.tech";
  const production = { VERCEL_ENV: "production", PORTAL_PRODUCTION_DATABASE_HOST: productionHost };
  const runtime = url("central_bi_runtime").replace(host, productionHost);
  const pool = createPostgresPool(runtime, "runtime", production);
  expect(pool).toMatchObject({ options: { host: productionHost, ssl: { rejectUnauthorized: true } } });
  await pool.end();
  for (const target of [url("central_bi_runtime"), "postgres://postgres@localhost/local", runtime.replace("verify-full", "require")]) {
    expect(() => createPostgresPool(target, "runtime", production)).toThrow();
  }
  expect(() => createPostgresPool(url("central_bi_runtime"), "runtime", { ...production, PORTAL_PRODUCTION_DATABASE_HOST: host })).toThrow();
});
