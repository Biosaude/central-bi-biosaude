import { Catalog } from "@/components/catalog";
import { PageHeading, Denied, DemoNotice } from "@/components/ui";
import { localDemoAllowed } from "@/lib/page-access";
import { getRepository } from "@/lib/sqlite";
export const metadata = { title: "Catálogo de dashboards" };
export default async function DashboardsPage() {
  if (!(await localDemoAllowed())) return <Denied />;
  return (
    <>
      <PageHeading
        eyebrow="EXPLORE SUA CENTRAL"
        title="Catálogo de dashboards"
        description="Encontre o módulo certo para cada perspectiva do seu negócio."
      />
      <Catalog dashboards={getRepository().list()} />
      <div className="spacer" />
      <DemoNotice />
    </>
  );
}
