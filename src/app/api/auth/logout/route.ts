import { NextResponse, type NextRequest } from "next/server";
import { corporateEnabled, corporateServices, corporateSettings, isPortalOrigin } from "@/lib/corporate";

export async function POST(request: NextRequest) {
  if (!corporateEnabled()) return new Response(null, { status: 404 });
  try {
    if (!isPortalOrigin(request)) return new Response(null, { status: 403 });
    const settings = corporateSettings();
    await corporateServices().identity.logout(request.cookies.get(settings.sessionCookie)?.value);
    const response = NextResponse.redirect(new URL("/", settings.redirect), {
      status: 303, headers: { "Cache-Control": "no-store" },
    });
    response.cookies.set(settings.sessionCookie, "", { ...settings.cookie, maxAge: 0 });
    response.cookies.set(settings.attemptCookie, "", { ...settings.cookie, maxAge: 0 });
    return response;
  } catch {
    return new Response("Não foi possível encerrar a sessão. Tente novamente.", {
      status: 503, headers: { "Cache-Control": "no-store" },
    });
  }
}
