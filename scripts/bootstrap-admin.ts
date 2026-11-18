import { randomUUID } from "node:crypto";
import { z } from "zod";
import { createPostgresPool } from "../src/lib/postgres/connection.ts";
import { inTransaction } from "../src/lib/postgres/transaction.ts";
import { writeAudit } from "../src/lib/postgres/identity.ts";

const input = z.object({
  tenant: z.uuid(),
  object: z.uuid(),
  name: z.string().trim().min(1).max(150),
  email: z.email().max(254),
}).safeParse({
  tenant: process.env.ENTRA_TENANT_ID,
  object: process.env.BOOTSTRAP_ENTRA_OBJECT_ID,
  name: process.env.BOOTSTRAP_ADMIN_NAME,
  email: process.env.BOOTSTRAP_ADMIN_EMAIL,
});

if (!input.success) {
  console.error("Configure os identificadores Entra, o nome e o e-mail do administrador inicial.");
  process.exitCode = 1;
} else {
  const { tenant, object, name, email } = input.data;
  try {
    const pool = createPostgresPool();
    try {
      const created = await inTransaction(pool, async (db) => {
        await db.query("LOCK TABLE central_bi.users IN SHARE ROW EXCLUSIVE MODE");
        const { rowCount } = await db.query(
          "SELECT 1 FROM central_bi.users WHERE entra_tenant_id=$1 AND enabled AND role_id='administrador'",
          [tenant],
        );
        if (rowCount) return false;
        const id = randomUUID();
        await db.query(`
          INSERT INTO central_bi.users(id, entra_tenant_id, entra_object_id, name, email, enabled, role_id)
          VALUES ($1,$2,$3,$4,$5,true,'administrador')`, [id, tenant, object, name, email]);
        await writeAudit(db, "bootstrap", "admin.user.created", { userId: id, role: "administrador" });
        return true;
      });
      console.log(created ? "Administrador inicial vinculado." : "Já existe um administrador ativo neste tenant.");
    } finally {
      await pool.end();
    }
  } catch {
    console.error("Falha ao vincular o administrador inicial. Confira o destino, a migração e o vínculo existente.");
    process.exitCode = 1;
  }
}
