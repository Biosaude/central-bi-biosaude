import { Denied } from "@/components/access-denied";
import { Catalog } from "@/components/catalog";
import { PageHeading, DemoNotice } from "@/components/ui";
import { portalAccess, portalDashboards } from "@/lib/page-access";
export const metadata = { title: "Catálogo de dashboards" };
export default async function DashboardsPage() {
  const access = await portalAccess();
  if (access.kind === "denied") return <Denied />;
  return (
    <>
      <PageHeading
        eyebrow="EXPLORE SUA CENTRAL"
        title="Catálogo de dashboards"
        description="Encontre o módulo certo para cada perspectiva do seu negócio."
      />
      <Catalog dashboards={await portalDashboards(access)} />
      <div className="spacer" />
      {access.kind === "demo" && <DemoNotice />}
    </>
  );
}
