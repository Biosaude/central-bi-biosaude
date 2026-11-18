import type { Metadata } from "next";
import { Shell } from "@/components/shell";
import { canManage, portalAccess, portalDashboards } from "@/lib/page-access";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Central de BI | Biosaúde",
    template: "%s | Central de BI Biosaúde",
  },
  description:
    "Central de inteligência Biosaúde. Portal demonstrativo local, sem dados reais.",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const access = await portalAccess();
  const dashboards = await portalDashboards(access);
  return (
    <html lang="pt-BR">
      <body>
        <Shell dashboards={dashboards} mode={access.kind} canManage={canManage(access)}>
          {children}
        </Shell>
      </body>
    </html>
  );
}
