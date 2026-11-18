import { NextResponse, type NextRequest } from "next/server";
import { corporateEnabled, corporateServices, corporateSettings } from "@/lib/corporate";
import { createEntraClient, type VerifiedEntraIdentity } from "@/lib/entra";
import { sessionSeconds, writeAudit } from "@/lib/postgres/identity";

export async function GET(request: NextRequest) {
  if (!corporateEnabled()) return new Response(null, { status: 404 });
  try {
    const settings = corporateSettings();
    const respond = (path: string) => {
      const response = NextResponse.redirect(new URL(path, settings.redirect), {
        status: 303, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
      });
      response.cookies.set(settings.attemptCookie, "", { ...settings.cookie, maxAge: 0 });
      return response;
    };
    const previous = request.cookies.get(settings.sessionCookie)?.value;
    const callback = new URL(settings.redirect);
    callback.search = request.nextUrl.search;
    const { identity, pool } = corporateServices();
    const attempt = await identity.consumeAttempt(
      request.cookies.get(settings.attemptCookie)?.value,
      callback.searchParams.get("state"),
    );
    if (!attempt) return respond("/acesso-negado");
    let verified: VerifiedEntraIdentity;
    try {
      verified = await (await createEntraClient(settings)).finish(callback, attempt);
    } catch {
      await writeAudit(pool, "oidc", "auth.callback.rejected");
      return respond("/acesso-negado");
    }
    const token = await identity.login(verified, previous);
    if (!token) return respond("/acesso-negado");
    const response = respond("/");
    response.cookies.set(settings.sessionCookie, token, { ...settings.cookie, maxAge: sessionSeconds });
    return response;
  } catch {
    return new Response("Não foi possível concluir o login corporativo.", {
      status: 503, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
    });
  }
}
