import { cache } from "react";
import { cookies, headers } from "next/headers";
import { isLocalDemo } from "./access";
import { corporateEnabled, corporateServices, corporateSettings } from "./corporate";
import { can } from "./domain";
import { tokenHash, type PortalPrincipal } from "./postgres/identity";
import { getRepository } from "./sqlite";

export type PortalAccess =
  | { kind: "denied" }
  | { kind: "demo" }
  | { kind: "entra"; principal: PortalPrincipal; sessionHash: string };

export const portalAccess = cache(async (): Promise<PortalAccess> => {
  if (!corporateEnabled()) {
    return { kind: isLocalDemo(await headers()) ? "demo" : "denied" };
  }
  try {
    const settings = corporateSettings();
    const token = (await cookies()).get(settings.sessionCookie)?.value;
    const sessionHash = tokenHash(token);
    if (!sessionHash) return { kind: "denied" };
    const principal = await corporateServices().identity.revalidate(token, settings.tenantId);
    if (principal) return { kind: "entra", principal, sessionHash };
  } catch {
    console.error("Não foi possível revalidar a sessão do portal.");
  }
  return { kind: "denied" };
});

export function canManage(access: PortalAccess) {
  return access.kind === "demo" ||
    (access.kind === "entra" && can(access.principal, "dashboard:manage"));
}

export function portalDashboards(access: PortalAccess, administrative = false) {
  if (access.kind === "demo") return getRepository().list(administrative);
  if (access.kind === "denied") return [];
  const { dashboards } = corporateServices();
  return administrative && canManage(access)
    ? dashboards.list(true)
    : dashboards.listGranted(access.principal.id);
}

export async function portalDashboard(access: PortalAccess, slug: string) {
  if (access.kind === "demo") return getRepository().find(slug);
  if (access.kind === "entra") {
    return (await corporateServices().dashboards.listGranted(access.principal.id, slug))[0];
  }
}
