import { Pool } from "pg";

const homologationHost = "ep-quiet-bird-b6xxmzh7.c-2.sa-east-1.aws.neon.tech";
const databaseRoles = {
  runtime: "central_bi_runtime",
  migration: "central_bi_migrator",
} as const;
type DatabasePurpose = keyof typeof databaseRoles;

export function createPostgresPool(
  value = process.env.DATABASE_URL,
  purpose: DatabasePurpose = "runtime",
  env: Record<string, string | undefined> = process.env,
) {
  const variable = purpose === "migration" ? "MIGRATION_DATABASE_URL" : "DATABASE_URL";
  if (!value || !URL.canParse(value)) {
    throw new Error(`Configure ${variable} no ambiente do servidor.`);
  }
  const url = new URL(value);
  const sslMode = url.searchParams.get("sslmode");
  const database = url.pathname.slice(1);
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname ||
      !url.username || !database || database.includes("/") || url.hash ||
      [...url.searchParams.keys()].some((key) => key !== "sslmode") ||
      url.searchParams.getAll("sslmode").length > 1 ||
      (sslMode !== null && sslMode !== "verify-full")) {
    throw new Error("URL PostgreSQL inválida ou com opções de conexão não permitidas.");
  }
  const local = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  const production = env.VERCEL_ENV === "production" || env.PORTAL_DATABASE_ENV === "production";
  const productionHost = env.PORTAL_PRODUCTION_DATABASE_HOST;
  const productionDatabase = env.PORTAL_PRODUCTION_DATABASE_NAME ?? "neondb";
  if (production && (!productionHost || !/^ep-[a-z0-9-]+(?:\.[a-z0-9-]+)*\.neon\.tech$/.test(productionHost) ||
      [homologationHost, "ep-rough-sunset-b6bze16d.c-2.sa-east-1.aws.neon.tech"].includes(productionHost.replace("-pooler.", ".")) ||
      (env.VERCEL_ENV && env.VERCEL_ENV !== "production"))) {
    throw new Error("Configure um destino operacional Neon exclusivo para a Central.");
  }
  const expectedHost = production ? productionHost : homologationHost;
  if ((production || !local) && (url.hostname !== expectedHost ||
      database !== (production ? productionDatabase : "neondb") ||
      (url.port && url.port !== "5432") || url.username !== databaseRoles[purpose] ||
      !url.password || sslMode !== "verify-full")) {
    throw new Error("A conexão remota exige o destino Neon do ambiente, o papel esperado e TLS verify-full.");
  }

  return new Pool({
    host: url.hostname === "[::1]" ? "::1" : url.hostname,
    port: Number(url.port || "5432"),
    database: decodeURIComponent(database),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    ssl: sslMode === "verify-full" ? { rejectUnauthorized: true } : false,
    enableChannelBinding: sslMode === "verify-full",
    connectionTimeoutMillis: 5000,
  });
}

export function createMigrationPool() {
  // Pass an explicit empty string to keep the runtime URL out of CLI commands.
  return createPostgresPool(process.env.MIGRATION_DATABASE_URL ?? "", "migration");
}
