import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, PlugZap, Clock3 } from "lucide-react";
import { PageHeading, Denied, Status } from "@/components/ui";
import { DashboardIcon } from "@/components/icons";
import { localDemoAllowed } from "@/lib/page-access";
import { getRepository } from "@/lib/sqlite";
export default async function DashboardPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  if (!(await localDemoAllowed())) return <Denied />;
  const { slug } = await params;
  const d = getRepository().find(slug);
  if (!d || !d.active) notFound();
  return (
    <>
      <Link className="back-link" href="/dashboards">
        <ArrowLeft size={15} />
        Voltar ao catálogo
      </Link>
      <PageHeading
        eyebrow={d.category.toUpperCase()}
        title={d.name}
        description={d.description}
        action={<Status />}
      />
      <section className="integration-placeholder">
        <span className="large-module-icon">
          <DashboardIcon name={d.icon} size={40} />
        </span>
        <span className="pending-label">
          <Clock3 size={14} />
          Integração pendente
        </span>
        <h2>Um novo olhar está a caminho.</h2>
        <p>
          Este módulo está cadastrado e pronto para receber sua futura
          integração. Por enquanto, esta tela é exclusivamente demonstrativa.
        </p>
        <div className="placeholder-foot">
          <PlugZap size={18} />
          Nenhuma fonte de dados conectada
        </div>
      </section>
      <div className="detail-grid">
        <div className="panel">
          <span className="eyebrow">SOBRE O MÓDULO</span>
          <dl>
            <div>
              <dt>Identificador</dt>
              <dd>{d.slug}</dd>
            </div>
            <div>
              <dt>Categoria</dt>
              <dd>{d.category}</dd>
            </div>
            <div>
              <dt>Tipo de integração futura</dt>
              <dd>
                {
                  {
                    pending: "A definir",
                    powerbi: "Power BI",
                    api: "API",
                    internal: "Interna",
                  }[d.integrationType]
                }
              </dd>
            </div>
          </dl>
        </div>
        <div className="panel">
          <span className="eyebrow">AMBIENTE DE DEMONSTRAÇÃO</span>
          <h3>Segurança desde o primeiro passo.</h3>
          <p className="muted">
            Sem iframes, URLs externas ou dados financeiros reais. A
            autenticação centralizada e os acessos individuais serão
            implementados na Fase 3.
          </p>
        </div>
      </div>
    </>
  );
}
