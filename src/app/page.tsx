import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Layers,
  CircleCheck,
  Unplug,
  Settings2,
  UsersRound,
  Compass,
} from "lucide-react";
import {
  DashboardCard,
  DemoNotice,
  Denied,
  PageHeading,
} from "@/components/ui";
import { getRepository } from "@/lib/sqlite";
import { localDemoAllowed } from "@/lib/page-access";

export default async function Home() {
  if (!(await localDemoAllowed())) return <Denied />;
  const all = getRepository().list(true);
  const active = all.filter((d) => d.active);
  return (
    <>
      <PageHeading
        eyebrow="SEU PONTO DE PARTIDA"
        title="Uma visão central. Novas possibilidades."
        description="Bem-vindo à Central de BI Biosaúde. Conecte informações e encontre o que precisa para decidir."
      />
      <section className="welcome-banner">
        <div className="banner-grid" />
        <div className="banner-copy">
          <span className="banner-kicker">
            <span />
            INFORMAÇÃO QUE APROXIMA
          </span>
          <h2>
            Mais clareza para decidir.
            <br />
            Mais tempo para cuidar.
          </h2>
          <p>
            Seus dashboards, organizados em um só lugar.
            <br />
            Explore os módulos e prepare sua próxima análise.
          </p>
          <Link href="/dashboards" className="button white">
            Explorar dashboards <ArrowUpRight size={17} />
          </Link>
        </div>
        <div className="banner-art" aria-hidden="true">
          <div className="art-orbit orbit-one" />
          <div className="art-orbit orbit-two" />
          <div className="art-card art-back">
            <span />
            <span />
            <span />
          </div>
          <div className="art-card art-front">
            <div className="art-card-heading">
              <span />
              <Layers size={19} />
            </div>
            <div className="art-bars">
              <i />
              <i />
              <i />
              <i />
              <i />
              <i />
            </div>
            <div className="art-baseline" />
          </div>
          <div className="art-badge">
            <CircleCheck size={17} />
            Tudo em um só lugar
          </div>
        </div>
      </section>
      <section className="stats-grid" aria-label="Resumo do ambiente">
        {[
          {
            label: "Dashboards cadastrados",
            value: all.length,
            foot: "Módulos no seu workspace",
            icon: Layers,
          },
          {
            label: "Módulos ativos",
            value: active.length,
            foot: "Disponíveis no catálogo",
            icon: CircleCheck,
          },
          {
            label: "Integrações conectadas",
            value: 0,
            foot: "Conexões previstas para outra fase",
            icon: Unplug,
          },
        ].map((stat) => (
          <div className="stat-card" key={stat.label}>
            <div className="stat-heading">
              {stat.label}
              <stat.icon size={18} />
            </div>
            <div className="stat-number">
              {String(stat.value).padStart(2, "0")}
              <span>
                {stat.label === "Integrações conectadas"
                  ? "Em preparação"
                  : "Demonstração"}
              </span>
            </div>
            <p>{stat.foot}</p>
          </div>
        ))}
      </section>
      <section className="dashboard-section">
        <div className="section-heading">
          <div>
            <div className="eyebrow">EXPLORE SUA CENTRAL</div>
            <h2>Seus dashboards</h2>
            <p>Uma nova perspectiva em cada módulo.</p>
          </div>
          <Link href="/dashboards" className="text-link">
            Ver catálogo completo
            <ArrowRight size={16} />
          </Link>
        </div>
        <div className="dashboard-grid">
          {active.slice(0, 3).map((d) => (
            <DashboardCard key={d.id} dashboard={d} />
          ))}
        </div>
        {active.length === 0 && (
          <p className="empty-state">
            Nenhum módulo ativo. Cadastre ou ative um dashboard no
            gerenciamento.
          </p>
        )}
      </section>
      <section className="quick-section">
        <div className="section-heading">
          <h2>Acesso rápido</h2>
          <span className="muted small">Organize a sua central</span>
        </div>
        <div className="quick-grid">
          {[
            {
              href: "/gerenciamento/dashboards",
              icon: Settings2,
              title: "Gerenciar dashboards",
              description: "Cadastre e organize seus módulos",
            },
            {
              href: "/gerenciamento/usuarios",
              icon: UsersRound,
              title: "Usuários e permissões",
              description: "Conheça a estrutura de acesso",
            },
            {
              href: "/configuracoes",
              icon: Compass,
              title: "Configurações da central",
              description: "Consulte o ambiente e as integrações",
            },
          ].map((item) => (
            <Link className="quick-card" href={item.href} key={item.href}>
              <item.icon size={20} />
              <div>
                <strong>{item.title}</strong>
                <span>{item.description}</span>
              </div>
              <ArrowUpRight size={16} />
            </Link>
          ))}
        </div>
      </section>
      <DemoNotice />
    </>
  );
}
