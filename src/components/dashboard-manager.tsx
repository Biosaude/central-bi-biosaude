"use client";
import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, ArrowDownUp, Save, X } from "lucide-react";
import type { Dashboard, DashboardInput } from "@/lib/domain";
import { DashboardIcon } from "./icons";
import { Status } from "./ui";
const empty: DashboardInput = {
  slug: "",
  name: "",
  description: "",
  icon: "chart",
  category: "",
  displayOrder: 40,
  active: true,
  integrationType: "pending",
};
export function DashboardManager({ dashboards }: { dashboards: Dashboard[] }) {
  const router = useRouter();
  const [form, setForm] = useState<DashboardInput | null>(null);
  const [id, setId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const formRef = useRef<HTMLElement>(null);
  function edit(d?: Dashboard) {
    setId(d?.id ?? null);
    setForm(
      d
        ? {
            slug: d.slug,
            name: d.name,
            description: d.description,
            icon: d.icon,
            category: d.category,
            displayOrder: d.displayOrder,
            active: d.active,
            integrationType: d.integrationType,
          }
        : { ...empty },
    );
    setError("");
    setMessage("");
    setTimeout(
      () =>
        formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
      50,
    );
  }
  async function persist(
    input: DashboardInput,
    targetId: number | null,
    close = false,
  ) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/dashboards", {
        method: targetId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...input,
          ...(targetId ? { id: targetId } : {}),
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error([result.error, ...(result.details || [])].join(" "));
      setMessage("Dashboard salvo com sucesso.");
      if (close) setForm(null);
      router.refresh();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar.");
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function toggle(d: Dashboard) {
    const { id: targetId, createdAt, updatedAt, ...input } = d;
    void createdAt;
    void updatedAt;
    await persist({ ...input, active: !d.active }, targetId);
  }
  return (
    <>
      <div className="manager-toolbar">
        <span>
          <ArrowDownUp size={16} />
          Menor ordem aparece primeiro no catálogo e no menu.
        </span>
        <button className="button primary" onClick={() => edit()}>
          <Plus size={17} />
          Novo dashboard
        </button>
      </div>
      <div aria-live="polite">
        {message && (
          <div className="success-message" role="status">
            {message}
          </div>
        )}
      </div>
      {error && (
        <div className="error-message" role="alert">
          {error}
        </div>
      )}
      {form && (
        <section
          className="panel editor-panel"
          ref={formRef}
          aria-label={id ? "Editar dashboard" : "Novo dashboard"}
        >
          <div className="section-heading">
            <h2>{id ? "Editar dashboard" : "Novo dashboard"}</h2>
            <button
              className="icon-button"
              onClick={() => setForm(null)}
              aria-label="Fechar formulário"
            >
              <X size={19} />
            </button>
          </div>
          <p className="muted small">
            Somente cadastro demonstrativo. Nenhuma integração será executada.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void persist(form, id, true);
            }}
          >
            <div className="form-grid">
              <label>
                Nome do dashboard
                <input
                  required
                  minLength={3}
                  maxLength={100}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </label>
              <label>
                Identificador único
                <input
                  required
                  pattern="[a-z0-9]+(-[a-z0-9]+)*"
                  minLength={2}
                  maxLength={70}
                  placeholder="ex.: qualidade-assistencial"
                  value={form.slug}
                  onChange={(e) => setForm({ ...form, slug: e.target.value })}
                />
                <small>
                  Usado na rota /dashboards/[identificador]. Alterá-lo muda o
                  endereço.
                </small>
              </label>
              <label className="full-width">
                Descrição
                <textarea
                  required
                  minLength={5}
                  maxLength={300}
                  rows={3}
                  value={form.description}
                  onChange={(e) =>
                    setForm({ ...form, description: e.target.value })
                  }
                />
              </label>
              <label>
                Categoria
                <input
                  required
                  minLength={2}
                  maxLength={50}
                  value={form.category}
                  onChange={(e) =>
                    setForm({ ...form, category: e.target.value })
                  }
                />
              </label>
              <label>
                Ícone
                <select
                  value={form.icon}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      icon: e.target.value as DashboardInput["icon"],
                    })
                  }
                >
                  <option value="chart">Gráfico</option>
                  <option value="shield">Proteção</option>
                  <option value="users">Pessoas</option>
                  <option value="activity">Atividade</option>
                  <option value="layers">Camadas</option>
                </select>
              </label>
              <label>
                Ordem de exibição
                <input
                  type="number"
                  min={0}
                  max={9999}
                  required
                  value={form.displayOrder}
                  onChange={(e) =>
                    setForm({ ...form, displayOrder: Number(e.target.value) })
                  }
                />
              </label>
              <label>
                Tipo de integração futura
                <select
                  value={form.integrationType}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      integrationType: e.target
                        .value as DashboardInput["integrationType"],
                    })
                  }
                >
                  <option value="pending">A definir</option>
                  <option value="powerbi">Power BI (pendente)</option>
                  <option value="api">API (pendente)</option>
                  <option value="internal">Interna (pendente)</option>
                </select>
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) =>
                    setForm({ ...form, active: e.target.checked })
                  }
                />
                Dashboard ativo
              </label>
            </div>
            <div className="form-actions">
              <button
                type="button"
                className="button secondary"
                onClick={() => setForm(null)}
                disabled={busy}
              >
                Cancelar
              </button>
              <button className="button primary" disabled={busy}>
                <Save size={16} />
                {busy ? "Salvando..." : "Salvar dashboard"}
              </button>
            </div>
          </form>
        </section>
      )}
      <div className="table-container">
        <table>
          <caption className="sr-only">
            Dashboards cadastrados, ordenados por exibição
          </caption>
          <thead>
            <tr>
              <th scope="col">Dashboard</th>
              <th scope="col">Categoria</th>
              <th scope="col">Ordem</th>
              <th scope="col">Status</th>
              <th scope="col">Ações</th>
            </tr>
          </thead>
          <tbody>
            {dashboards.map((d) => (
              <tr key={d.id}>
                <td>
                  <div className="table-dashboard">
                    <span className="table-icon">
                      <DashboardIcon name={d.icon} size={18} />
                    </span>
                    <div>
                      <strong>{d.name}</strong>
                      <small>{d.slug}</small>
                    </div>
                  </div>
                </td>
                <td>{d.category}</td>
                <td>{d.displayOrder}</td>
                <td>
                  <Status active={d.active} />
                </td>
                <td>
                  <div className="table-actions">
                    <button
                      className="button small-button secondary"
                      onClick={() => edit(d)}
                      disabled={busy}
                      aria-label={`Editar ${d.name}`}
                    >
                      <Pencil size={14} />
                      Editar
                    </button>
                    <button
                      className="button small-button ghost"
                      onClick={() => void toggle(d)}
                      disabled={busy}
                      aria-label={`${d.active ? "Desativar" : "Ativar"} ${d.name}`}
                    >
                      {d.active ? "Desativar" : "Ativar"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {dashboards.length === 0 && (
        <div className="empty-state">Nenhum dashboard cadastrado.</div>
      )}
    </>
  );
}
