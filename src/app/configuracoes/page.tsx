import { Denied } from "@/components/access-denied";
import { Database, PlugZap, LockKeyhole, Monitor } from "lucide-react";
import { PageHeading } from "@/components/ui";
import { portalAccess } from "@/lib/page-access";
export const metadata = { title: "Configurações" };
export default async function SettingsPage() {
  const access = await portalAccess();
  if (access.kind === "denied") return <Denied />;
  const demo = access.kind === "demo";
  return (
    <>
      <PageHeading
        eyebrow="SUA CENTRAL"
        title="Configurações"
        description="Transparência sobre o ambiente e os próximos passos da plataforma."
      />
      <div className="settings-grid">
        {[
          {
            icon: Monitor,
            title: "Ambiente",
            items: [
              ["Modo", demo ? "Desenvolvimento local" : "Corporativo"],
              ["Dados", demo ? "Exclusivamente fictícios" : "Dados da Central"],
              ["Versão", demo ? "0.1 · Fase 2" : "Fase 4D"],
            ],
          },
          {
            icon: Database,
            title: "Persistência",
            items: [
              ["Banco atual", demo ? "SQLite local" : "PostgreSQL"],

              ["Bancos externos", "Nenhum banco conectado"],
            ],
          },
          {
            icon: LockKeyhole,
            title: "Identidade e acesso",
            items: [
              ["Autenticação", demo ? "Demonstração local" : "Microsoft Entra ID"],

              ["Política padrão", "Negar acesso"],
            ],
          },
          {
            icon: PlugZap,
            title: "Integrações",
            items: [
              ["Dashboards", "Integração pendente"],
              ["Conteúdo incorporado", "Bloqueado"],
              ["APIs externas", "Não utilizadas"],
            ],
          },
        ].map((section) => (
          <section className="panel" key={section.title}>
            <div className="settings-title">
              <section.icon size={20} />
              <h2>{section.title}</h2>
            </div>
            <dl>
              {section.items.map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
      <div className="panel brand-panel">
        <div>
          <div className="eyebrow">IDENTIDADE INSTITUCIONAL</div>
          <h2>Um lugar para a marca oficial.</h2>
          <p className="muted">
            A logomarca oficial da Biosaúde será aplicada quando o arquivo
            aprovado estiver disponível. O nome em texto é apenas uma
            identificação provisória.
          </p>
        </div>
        <div className="logo-placeholder">
          Logomarca oficial
          <br />
          <span>Arquivo a disponibilizar</span>
        </div>
      </div>
    </>
  );
}
