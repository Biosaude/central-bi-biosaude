const publicCommercial = "https://movopainelcomercial.vercel.app/";

const destinations: Readonly<Record<string, { variable: string; publicHost: string; label: string }>> = {
  "painel-comercial-r1": { variable: "COMMERCIAL_PREVIEW_ORIGIN", publicHost: "movopainelcomercial.vercel.app", label: "Abrir Dashboard Comercial" },
  "retencao-faturamento": { variable: "RETENTION_PREVIEW_ORIGIN", publicHost: "reten-o-de-faturamento.vercel.app", label: "Abrir Retenção de Faturamento" },
  "limite-global-cliente": { variable: "GLOBAL_LIMIT_PREVIEW_ORIGIN", publicHost: "novolimiteglobalporcliente.vercel.app", label: "Abrir Limite Global" },
};

export function dashboardLaunch(
  slug: string,
  env: Record<string, string | undefined> = process.env,
): { href: string; label: string; preview: boolean } | undefined {
  if (!Object.hasOwn(destinations, slug)) return;
  const { variable, label, publicHost } = destinations[slug];
  if (env.VERCEL_ENV !== "preview")
    return slug === "painel-comercial-r1" ? { href: publicCommercial, label, preview: false } : undefined;

  const configured = env[variable];
  if (!configured || !/^https:\/\/[a-z0-9.-]+\/?$/i.test(configured)) return;
  const url = URL.parse(configured);
  if (!url || !url.hostname.includes(".") ||
      !url.hostname.replace(/\.$/, "").split(".").every((label) => /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)) ||
      url.hostname.replace(/\.$/, "") === publicHost) return;
  return { href: url.href, label, preview: true };
}
