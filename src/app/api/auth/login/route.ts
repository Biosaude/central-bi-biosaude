import { NextResponse } from "next/server";
import { corporateEnabled, corporateServices, corporateSettings } from "@/lib/corporate";
import { createEntraClient } from "@/lib/entra";
import { loginSeconds } from "@/lib/postgres/identity";

export async function GET(request: Request) {
  if (!corporateEnabled()) return new Response(null, { status: 404 });
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    return new Response(null, { status: 403 });
  }
  try {
    const settings = corporateSettings();
    const { authorizationUrl, attempt } = await (await createEntraClient(settings)).start();
    const token = await corporateServices().identity.storeAttempt(attempt);
    const response = NextResponse.redirect(authorizationUrl, {
      status: 303, headers: { "Cache-Control": "no-store" },
    });
    response.cookies.set(settings.attemptCookie, token, { ...settings.cookie, maxAge: loginSeconds });
    return response;
  } catch {
    return new Response("Não foi possível iniciar o login corporativo.", {
      status: 503, headers: { "Cache-Control": "no-store" },
    });
  }
}
