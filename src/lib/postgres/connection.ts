import { Pool } from "pg";

export function createPostgresPool(value = process.env.DATABASE_URL) {
  if (!value || !URL.canParse(value)) {
    throw new Error("Configure DATABASE_URL no ambiente do servidor.");
  }
  const url = new URL(value);
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname) {
    throw new Error("DATABASE_URL deve identificar um servidor PostgreSQL.");
  }
  return new Pool({ connectionString: value, connectionTimeoutMillis: 5000 });
}
