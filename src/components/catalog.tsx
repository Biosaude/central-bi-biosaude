"use client";
import { useState } from "react";
import { Search, Grid2X2, SlidersHorizontal } from "lucide-react";
import { DashboardCard } from "./ui";
import type { Dashboard } from "@/lib/domain";
export function Catalog({ dashboards }: { dashboards: Dashboard[] }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Todas as categorias");
  const filtered = dashboards.filter(
    (d) =>
      `${d.name} ${d.description}`
        .toLocaleLowerCase("pt-BR")
        .includes(query.toLocaleLowerCase("pt-BR")) &&
      (category === "Todas as categorias" || d.category === category),
  );
  return (
    <>
      <div className="catalog-toolbar">
        <div className="search-input">
          <Search size={18} />
          <input
            aria-label="Buscar dashboard"
            placeholder="Buscar por nome ou descrição..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <label className="category-filter">
          <SlidersHorizontal size={16} />
          <select
            aria-label="Filtrar por categoria"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option>Todas as categorias</option>
            {[...new Set(dashboards.map((d) => d.category))].sort().map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="catalog-count">
        <span>
          {filtered.length}{" "}
          {filtered.length === 1
            ? "dashboard disponível"
            : "dashboards disponíveis"}
        </span>
        <Grid2X2 size={16} />
      </div>
      <div className="dashboard-grid">
        {filtered.map((d) => (
          <DashboardCard key={d.id} dashboard={d} />
        ))}
      </div>
      {filtered.length === 0 && (
        <div className="empty-state">
          Nenhum dashboard encontrado. Ajuste a busca ou a categoria.
        </div>
      )}
    </>
  );
}
