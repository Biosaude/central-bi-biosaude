import { DashboardManager } from "@/components/dashboard-manager";
import { PageHeading, DemoNotice, Denied } from "@/components/ui";
import { localDemoAllowed } from "@/lib/page-access";
import { getRepository } from "@/lib/sqlite";
export const metadata = { title: "Gerenciar dashboards" };
export default async function ManageDashboardsPage() {
  if (!(await localDemoAllowed())) return <Denied />;
  return (
    <>
      <PageHeading
        eyebrow="GERENCIAMENTO"
        title="Gerenciar dashboards"
        description="Cadastre, edite e organize os módulos da sua central."
      />
      <DashboardManager dashboards={getRepository().list(true)} />
      <div className="spacer" />
      <DemoNotice />
    </>
  );
}
