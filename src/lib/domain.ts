import { z } from "zod";

export const dashboardInput = z
  .object({
    slug: z
      .string()
      .min(2)
      .max(70)
      .regex(
        /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
        "Use letras minúsculas, números e hífens.",
      ),
    name: z.string().trim().min(3).max(100),
    description: z.string().trim().min(5).max(300),
    icon: z.enum(["chart", "shield", "users", "activity", "layers"]),
    category: z.string().trim().min(2).max(50),
    displayOrder: z.number().int().min(0).max(9999),
    active: z.boolean(),
    integrationType: z.enum(["pending", "powerbi", "api", "internal"]),
  })
  .strict();
export type DashboardInput = z.infer<typeof dashboardInput>;
export type Dashboard = DashboardInput & {
  id: number;
  createdAt: string;
  updatedAt: string;
};
export type Role = "administrador" | "gestor" | "visualizador";
export type Permission = "dashboard:read" | "dashboard:manage" | "users:manage";
export type Principal = {
  subject: string;
  role: Role;
  dashboardSlugs: string[];
};

// Future OIDC integration must supply a verified principal on the server.
// Individual dashboard grants are required even for administrators.
export function can(
  principal: Principal | null,
  action: Permission,
  slug?: string,
): boolean {
  if (!principal) return false;
  if (action === "dashboard:read")
    return !!slug && principal.dashboardSlugs.includes(slug);
  return principal.role === "administrador";
}
export interface IdentityProvider {
  getVerifiedPrincipal(): Promise<Principal | null>;
}
export const denyByDefaultProvider: IdentityProvider = {
  async getVerifiedPrincipal() {
    return null;
  },
};
export interface DashboardRepository {
  list(includeInactive?: boolean): Dashboard[];
  find(slug: string): Dashboard | undefined;
  create(input: DashboardInput): Dashboard;
  update(id: number, input: DashboardInput): Dashboard | undefined;
}
