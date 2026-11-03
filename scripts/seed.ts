import { getRepository } from "../src/lib/sqlite.ts";
const repo = getRepository();
console.log(
  `SQLite local preparado: ${repo.list(true).length} dashboards fictícios.`,
);
repo.db.close();
