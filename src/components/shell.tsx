"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  ArrowUpRight,
  ChevronRight,
  LayoutDashboard,
  Grid2X2,
  SlidersHorizontal,
  UsersRound,
  Settings2,
  Menu,
  X,
  LockKeyhole,
} from "lucide-react";
import type { Dashboard } from "@/lib/domain";
import { DashboardIcon } from "./icons";

const navigation = [
  { href: "/", label: "Visão geral", icon: LayoutDashboard },
  { href: "/dashboards", label: "Catálogo de dashboards", icon: Grid2X2 },
  {
    href: "/gerenciamento/dashboards",
    label: "Dashboards",
    icon: SlidersHorizontal,
  },
  {
    href: "/gerenciamento/usuarios",
    label: "Usuários e permissões",
    icon: UsersRound,
  },
  { href: "/configuracoes", label: "Configurações", icon: Settings2 },
];
export function Shell({
  children,
  dashboards,
  mode,
  canManage,
}: {
  children: React.ReactNode;
  dashboards: Dashboard[];
  mode: "denied" | "demo" | "entra";
  canManage: boolean;
}) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const current =
    navigation.find((item) => item.href === path)?.label || "Dashboard";
  return (
    <div className="app-shell">
      <a className="skip-link" href="#conteudo">
        Ir para o conteúdo
      </a>
      {open && (
        <button
          className="sidebar-backdrop"
          aria-label="Fechar navegação"
          onClick={() => setOpen(false)}
        />
      )}
      <aside
        className={`sidebar ${open ? "is-open" : ""}`}
        aria-label="Menu lateral"
      >
        <div className="brand">
          <span className="brand-word">
            BIOSAÚDE<span className="brand-dot">.</span>
          </span>
          <span className="brand-caption">CENTRAL DE INTELIGÊNCIA</span>
          <span className="logo-note">Espaço reservado à marca oficial</span>
        </div>
        <div className="sidebar-label">
          WORKSPACE <span className="workspace-indicator" />
        </div>
        <nav aria-label="Navegação principal">
          {navigation.map((item, index) => (!canManage && item.href.startsWith("/gerenciamento/") && mode === "entra") ? null : (
            <div key={item.href}>
              {index === 2 && (
                <div className="sidebar-label management-label">
                  GERENCIAMENTO
                </div>
              )}
              <Link
                href={item.href}
                onClick={() => setOpen(false)}
                className={`nav-link ${path === item.href ? "selected" : ""}`}
                aria-current={path === item.href ? "page" : undefined}
              >
                <item.icon size={18} strokeWidth={1.7} />
                {item.label}
                {path === item.href && (
                  <ChevronRight size={14} className="nav-chevron" />
                )}
              </Link>
            </div>
          ))}
        </nav>
        <div className="sidebar-label modules-label">
          SEUS MÓDULOS{" "}
          <span>{dashboards.length.toString().padStart(2, "0")}</span>
        </div>
        <nav aria-label="Módulos ativos">
          {dashboards.map((d) => (
            <Link
              key={d.id}
              href={`/dashboards/${d.slug}`}
              onClick={() => setOpen(false)}
              className={`module-link ${path === `/dashboards/${d.slug}` ? "selected" : ""}`}
            >
              <DashboardIcon name={d.icon} size={16} />
              <span>
                {d.name.replace("Dashboard de ", "").replace("Dashboard ", "")}
              </span>
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="local-tag">
            <span className="status-dot" />
            {mode === "demo" ? "Ambiente local" : mode === "entra" ? "Ambiente corporativo" : "Acesso restrito"}
          </div>
          <p>
            Inteligência que conecta
            <br />
            cuidado e decisão.
          </p>
          <div className="sidebar-version">
            CENTRAL DE BI <span>{mode === "entra" ? "Fase 4D" : "v0.1 · Fase 2"}</span>
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="mobile-menu icon-button"
              aria-label={open ? "Fechar menu" : "Abrir menu"}
              aria-expanded={open}
              onClick={() => setOpen(!open)}
            >
              {open ? <X size={20} /> : <Menu size={20} />}
            </button>
            <span>Central de BI</span>
            <ChevronRight size={13} />
            <strong>{current}</strong>
          </div>
          <div className="topbar-right">
            <span className="demo-pill">
              <span className="status-dot" />
              {mode === "entra" ? "Sessão corporativa" : "Demonstração local"}
            </span>
            <span className="header-divider" />
            {mode === "entra" ? (
              <form action="/api/auth/logout" method="post">
                <button type="submit" className="button secondary">Sair</button>
              </form>
            ) : <div
              className="environment-avatar"
              title="Ambiente de desenvolvimento, sem usuário autenticado"
            >
              <LockKeyhole size={18} />
            </div>}
          </div>
        </header>
        <main id="conteudo" tabIndex={-1}>
          {children}
        </main>
        <footer className="footer">
          <span>© {new Date().getFullYear()} Biosaúde · Central de BI</span>
          <span>
            {mode !== "entra" && <>Dados fictícios <span className="footer-dot">·</span> </>}Integrações
            pendentes <ArrowUpRight size={13} />
          </span>
        </footer>
      </div>
    </div>
  );
}
