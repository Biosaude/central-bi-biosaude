import type { Metadata } from "next";
import { Shell } from "@/components/shell";
import { localDemoAllowed } from "@/lib/page-access";
import { getRepository } from "@/lib/sqlite";
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
  const enabled = await localDemoAllowed();
  const dashboards = enabled ? getRepository().list() : [];
  return (
    <html lang="pt-BR">
      <body>
        <Shell dashboards={dashboards} enabled={enabled}>
          {children}
        </Shell>
      </body>
    </html>
  );
}
