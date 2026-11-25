// Read-only. Prints deployment metadata and configuration names, never variable values.
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

const models = {
  central: { env: "CENTRAL", callback: "/api/auth/callback" },
  comercial: { env: "COMMERCIAL", redis: "comercial", callback: "/api/corporate-auth/callback" },
  retencao: { env: "RETENTION", redis: "retention", callback: "/api/corporate-auth/callback" },
  limite: { env: "GLOBAL_LIMIT", redis: "global-limit", callback: "/api/corporate-auth/callback" },
};

export function configurationPlan(env) {
  return Object.entries(models).map(([name, model]) => {
    const variable = `${model.env}_RELEASE_ORIGIN`;
    const raw = env[variable];
    const url = raw && URL.parse(raw);
    if (!url || url.protocol !== "https:" || url.href !== url.origin + "/")
      throw new Error(`Origem HTTPS inválida ou ausente em ${variable}.`);
    const origin = url.origin;
    const prefix = model.redis && `${model.redis}:production:${createHash("sha256").update(origin).digest("hex")}`;
    return { name, origin, callback: origin + model.callback,
      redisKeys: prefix ? [`~${prefix}:login:*`, `~${prefix}:session:*`] : [] };
  });
}

export async function inventory(env, fetcher = fetch) {
  const token = env.VERCEL_TOKEN;
  if (!token) throw new Error("A inspeção requer acesso de leitura autorizado à API da Vercel.");
  const config = configurationPlan(env);
  async function get(path, query = {}) {
    const url = new URL(path, "https://api.vercel.com");
    for (const [key, value] of Object.entries({ teamId: env.VERCEL_TEAM_ID, ...query }))
      if (value) url.searchParams.set(key, String(value));
    const response = await fetcher(url, {
      method: "GET", headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      redirect: "error", signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) throw new Error(`Vercel recusou GET ${path.replace(/prj_[a-zA-Z0-9]+/, "(projeto)")} (HTTP ${response.status}).`);
    return response.json();
  }
  async function list(path, key, query) {
    const result = [];
    const cursors = new Set();
    let until;
    do {
      const body = await get(path, { ...query, limit: 100, until });
      if (!Array.isArray(body[key])) throw new Error(`Resposta inesperada em GET ${path}.`);
      result.push(...body[key]);
      until = body.pagination?.next;
      if (until && cursors.has(until)) throw new Error("Paginação da Vercel não avançou.");
      cursors.add(until);
    } while (until);
    return result;
  }
  return Promise.all(config.map(async ({ name, ...plan }) => {
    const model = models[name];
    const id = env[`VERCEL_${model.env}_PROJECT_ID`];
    const approved = env[`${model.env}_RELEASE_SHA`];
    if (!id || !/^prj_[a-zA-Z0-9]+$/.test(id) || !/^[a-f0-9]{40}$/.test(approved ?? ""))
      throw new Error(`Informe o ID de projeto e o SHA aprovado de ${name}.`);
    const [project, deployments, aliases] = await Promise.all([
      get(`/v9/projects/${id}`),
      list("/v6/deployments", "deployments", { projectId: id }),
      list("/v4/aliases", "aliases", { projectId: id }),
    ]);
    return {
      name, ...plan, approved,
      productionBranch: project.link?.productionBranch ?? null,
      protection: { sso: project.ssoProtection?.deploymentType ?? null,
        passwordConfigured: Boolean(project.passwordProtection), trustedIpsConfigured: Boolean(project.trustedIps) },
      aliases: aliases.map(alias => ({ host: alias.alias, deployment: alias.deploymentId ?? alias.deployment?.id ?? null })),
      deployments: deployments.map(deployment => {
        const commit = deployment.meta?.githubCommitSha ?? deployment.gitSource?.sha ?? null;
        return { id: deployment.uid ?? deployment.id, host: deployment.url, target: deployment.target,
          status: deployment.readyState ?? deployment.state, commit, reviewLegacyAccess: commit !== approved };
      }),
    };
  }));
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    const args = process.argv.slice(2);
    if (args.length !== 1 || !["--plano", "--vercel"].includes(args[0]))
      throw new Error("Uso: node scripts/inventario-publicacao.mjs --plano|--vercel");
    const result = args[0] === "--plano" ? configurationPlan(process.env) : await inventory(process.env);
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(error instanceof Error && error.cause === undefined ? error.message : "Falha de conectividade com a API da Vercel.");
    process.exitCode = 1;
  }
}
