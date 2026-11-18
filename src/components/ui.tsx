import Link from "next/link";
import { ArrowUpRight, LockKeyhole, Clock3 } from "lucide-react";
import type { Dashboard } from "@/lib/domain";
import { DashboardIcon } from "./icons";

export function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}
export function Status({ active = true }: { active?: boolean }) {
  return (
    <span className={`status-badge ${active ? "" : "inactive"}`}>
      <span className="status-dot" />
      {active ? "Ativo" : "Inativo"}
    </span>
  );
}
export function DashboardCard({ dashboard }: { dashboard: Dashboard }) {
  return (
    <article className="dashboard-card">
      <div className="card-top">
        <span className="module-icon">
          <DashboardIcon name={dashboard.icon} />
        </span>
        <span className="category-chip">{dashboard.category}</span>
      </div>
      <h3>{dashboard.name}</h3>
      <p>{dashboard.description}</p>
      <div className="integration-note">
        <Clock3 size={13} />
        Integração pendente
      </div>
      <Link className="card-link" href={`/dashboards/${dashboard.slug}`}>
        Explorar módulo
        <ArrowUpRight size={17} />
      </Link>
    </article>
  );
}
export function DemoNotice() {
  return (
    <div className="demo-notice">
      <div className="notice-icon">
        <LockKeyhole size={19} />
      </div>
      <div>
        <strong>Um ambiente para construir o próximo passo.</strong>
        <p>
          Esta é uma demonstração local com dados fictícios. Os dashboards ainda
          não estão conectados a fontes de dados.
        </p>
      </div>
      <span className="phase-tag">FASE 02</span>
    </div>
  );
}
