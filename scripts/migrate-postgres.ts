import { createMigrationPool } from "../src/lib/postgres/connection.ts";
import { migratePostgres } from "../src/lib/postgres/migrations.ts";

try {
  const pool = createMigrationPool();
  try {
    const applied = await migratePostgres(pool);
    console.log(applied.length ? `Migrações aplicadas: ${applied.join(", ")}` : "Banco atualizado.");
  } finally {
    await pool.end();
  }
} catch (error) {
  const code = error instanceof Error && "code" in error ? error.code : undefined;
  const suffix = typeof code === "string" && /^[A-Z0-9_]{1,32}$/.test(code) ? ` (${code})` : "";
  console.error(`Falha ao executar migrações PostgreSQL${suffix}. Confira o destino e o histórico.`);
  process.exitCode = 1;
}
