import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import type { Pool } from "pg";
import { inTransaction } from "./transaction.ts";

const directory = new URL("../../../db/migrations/", import.meta.url);

export async function migratePostgres(pool: Pool) {
  const names = (await readdir(directory)).filter((name) => name.endsWith(".sql")).sort();
  const migrations = await Promise.all(
    names.map(async (name) => {
      const sql = await readFile(new URL(name, directory), "utf8");
      return { name, sql, checksum: createHash("sha256").update(sql).digest("hex") };
    }),
  );
  return inTransaction(pool, async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(630188410420::bigint)");
    await client.query("CREATE SCHEMA IF NOT EXISTS central_bi");
    await client.query(`
      CREATE TABLE IF NOT EXISTS central_bi.schema_migrations (
        name text PRIMARY KEY,
        checksum text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    const { rows } = await client.query<{ name: string; checksum: string }>(
      "SELECT name, checksum FROM central_bi.schema_migrations",
    );
    const files = new Map(migrations.map(({ name, checksum }) => [name, checksum]));
    for (const { name, checksum } of rows) {
      if (files.get(name) !== checksum) {
        throw new Error("O histórico de migrações aplicado diverge dos arquivos disponíveis.");
      }
    }
    const applied = new Set(rows.map(({ name }) => name));
    const pending = migrations.filter(({ name }) => !applied.has(name));
    for (const { name, checksum, sql } of pending) {
      await client.query(sql);
      await client.query(
        "INSERT INTO central_bi.schema_migrations(name, checksum) VALUES ($1, $2)",
        [name, checksum],
      );
    }
    return pending.map(({ name }) => name);
  });
}
