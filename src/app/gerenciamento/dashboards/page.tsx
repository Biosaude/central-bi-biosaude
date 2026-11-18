import { Denied } from "@/components/access-denied";
import { DashboardManager } from "@/components/dashboard-manager";
import { PageHeading, DemoNotice } from "@/components/ui";
import { canManage, portalAccess, portalDashboards } from "@/lib/page-access";
export const metadata = { title: "Gerenciar dashboards" };
export default async function ManageDashboardsPage() {
  const access = await portalAccess();
  if (!canManage(access)) return <Denied />;
  return (
    <>
      <PageHeading
        eyebrow="GERENCIAMENTO"
        title="Gerenciar dashboards"
        description="Cadastre, edite e organize os módulos da sua central."
      />
      <DashboardManager dashboards={await portalDashboards(access, true)} />
      <div className="spacer" />
      {access.kind === "demo" && <DemoNotice />}
    </>
  );
}
