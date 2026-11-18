import { NextResponse } from "next/server";
import { z } from "zod";
import { corporateServices, corporateSettings, isPortalOrigin } from "@/lib/corporate";
import { entraIdPattern } from "@/lib/entra";
import { canManage, portalAccess } from "@/lib/page-access";
import { manageAccess } from "@/lib/postgres/administration";
import { AccessDeniedError, AccessTargetError } from "@/lib/postgres/identity";

const bool = z.enum(["true", "false"]).transform((value) => value === "true");
const form = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("user"),
    objectId: z.string().trim().regex(entraIdPattern).transform((value) => value.toLowerCase()),
    name: z.string().trim().min(1).max(150),
    email: z.email().max(254),
    role: z.enum(["administrador", "gestor", "visualizador"]),
    enabled: bool,
  }).strict(),
  z.object({
    action: z.literal("grant"),
    userId: z.uuid(),
    dashboardId: z.coerce.number().int().min(1).max(2147483647),
    granted: bool,
  }).strict(),
  z.object({ action: z.literal("revoke"), userId: z.uuid() }).strict(),
]);

const failure = (message: string, status: number) => new Response(message, {
  status, headers: { "Cache-Control": "no-store" },
});

export async function POST(request: Request) {
  const access = await portalAccess();
  if (access.kind !== "entra" || !canManage(access) || !isPortalOrigin(request)) {
    return failure("Acesso negado.", 403);
  }
  if (request.headers.get("content-type")?.split(";")[0] !== "application/x-www-form-urlencoded") {
    return failure("Formato de formulário inválido.", 415);
  }
  try {
    const reader = request.body?.getReader();
    if (!reader) return failure("Formulário obrigatório.", 400);
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 8192) {
        await reader.cancel();
        return failure("Formulário excede o limite permitido.", 413);
      }
      chunks.push(value);
    }
    const values = new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
    if (new Set(values.keys()).size !== values.size) return failure("Formulário inválido.", 400);
    const parsed = form.safeParse(Object.fromEntries(values));
    if (!parsed.success) return failure("Revise os campos do formulário.", 400);
    await manageAccess(corporateServices().pool, access.sessionHash, access.principal.tenantId, parsed.data);
    return NextResponse.redirect(new URL("/gerenciamento/usuarios", corporateSettings().redirect), {
      status: 303, headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof AccessDeniedError) return failure("Acesso negado.", 403);
    if (error instanceof AccessTargetError) return failure(error.message, 400);
    if (error instanceof Error && "code" in error && error.code === "23505") {
      return failure("Já existe um cadastro com esse e-mail. Revise o vínculo com o Entra ID.", 409);
    }
    console.error("Falha ao atualizar a administração de acesso.");
    return failure("Não foi possível salvar. Tente novamente.", 500);
  }
}
