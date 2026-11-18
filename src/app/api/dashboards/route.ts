import { NextResponse } from "next/server";
import { corporateServices, isPortalOrigin } from "@/lib/corporate";
import { canManage, portalAccess, portalDashboards } from "@/lib/page-access";
import { AccessDeniedError, auditActor, lockAdministrator } from "@/lib/postgres/identity";
import { dashboardInput } from "@/lib/domain";
import { getRepository } from "@/lib/sqlite";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const response = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
export async function GET(request: Request) {
  const access = await portalAccess();
  if (access.kind === "denied") return response({ error: "Acesso negado." }, 403);
  return response(await portalDashboards(access, canManage(access)));
}
export async function POST(request: Request) {
  return mutate(request);
}
export async function PUT(request: Request) {
  return mutate(request);
}
async function mutate(request: Request) {
  const access = await portalAccess();
  if (!canManage(access) || (access.kind === "entra" && !isPortalOrigin(request))) {
    return response({ error: "Acesso negado." }, 403);
  }
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    return response({ error: "Envie JSON." }, 415);
  // Bound the streamed body, rather than trusting Content-Length.
  const reader = request.body?.getReader();
  if (!reader) return response({ error: "Corpo obrigatório." }, 400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 8192) {
        await reader.cancel();
        return response({ error: "Cadastro excede o limite permitido." }, 413);
      }
      chunks.push(value);
    }
    const json = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    const { id, ...fields } = json;
    if (request.method === "PUT" && (!Number.isSafeInteger(id) || id <= 0))
      return response({ error: "Identificador inválido." }, 400);
    if (request.method === "POST" && id !== undefined)
      return response({ error: "Identificador gerado automaticamente." }, 400);
    const parsed = dashboardInput.safeParse(fields);
    if (!parsed.success)
      return response(
        {
          error: "Revise os campos do cadastro.",
          details: parsed.error.issues.map(
            (i) => `${i.path.join(".")}: ${i.message}`,
          ),
        },
        400,
      );
    let dashboard;
    if (access.kind === "entra") {
      const repo = corporateServices().dashboards;
      const { sessionHash, principal } = access;
      const authorize = async (client: Parameters<typeof lockAdministrator>[0]) => {
        const admin = await lockAdministrator(client, sessionHash, principal.tenantId);
        if (!admin) throw new AccessDeniedError();
        return auditActor(admin);
      };
      dashboard = request.method === "POST"
        ? await repo.create(parsed.data, authorize)
        : await repo.update(id, parsed.data, authorize);
    } else {
      const repo = getRepository();
      dashboard = request.method === "POST" ? repo.create(parsed.data) : repo.update(id, parsed.data);
    }
    if (!dashboard)
      return response({ error: "Dashboard não encontrado." }, 404);
    return response(dashboard, request.method === "POST" ? 201 : 200);
  } catch (error) {
    if (error instanceof AccessDeniedError) return response({ error: "Acesso negado." }, 403);
    if (error instanceof SyntaxError || error instanceof TypeError)
      return response({ error: "JSON inválido." }, 400);
    if (
      error instanceof Error &&
      (error.message.includes("UNIQUE constraint failed: dashboards.slug") ||
        ("code" in error && error.code === "23505"))
    )
      return response({ error: "Este identificador já está em uso." }, 409);
    console.error("Falha na persistência do cadastro de dashboard.");
    return response(
      { error: "Não foi possível salvar. Tente novamente." },
      500,
    );
  }
}
