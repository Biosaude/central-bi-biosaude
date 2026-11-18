import { describe, expect, it } from "vitest";
import { dashboardLaunch } from "../../src/lib/dashboard-launch";

describe("destinos dos dashboards", () => {
  const preview = { VERCEL_ENV: "preview" };
  it("mantém a abertura existente do Comercial fora de Preview", () => {
    expect(dashboardLaunch("painel-comercial-r1", { VERCEL_ENV: "production",
      COMMERCIAL_PREVIEW_ORIGIN: "https://outro.example",
    })?.href).toBe("https://movopainelcomercial.vercel.app/");
    expect(dashboardLaunch("retencao-faturamento", {})).toBeUndefined();
  });

  it("seleciona uma origem HTTPS fixa por módulo", () => {
    const settings = { ...preview, COMMERCIAL_PREVIEW_ORIGIN: "https://commercial.example",
      RETENTION_PREVIEW_ORIGIN: "https://retention.example",
      GLOBAL_LIMIT_PREVIEW_ORIGIN: "https://limit.example",
    };
    expect(dashboardLaunch("painel-comercial-r1", settings)?.href).toBe("https://commercial.example/");
    expect(dashboardLaunch("retencao-faturamento", settings)?.href).toBe("https://retention.example/");
    expect(dashboardLaunch("limite-global-cliente", settings)?.href).toBe("https://limit.example/");
    expect(dashboardLaunch("constructor", settings)).toBeUndefined();
  });

  it.each([undefined, "https://movopainelcomercial.vercel.app./", "http://preview.example",
    "https://preview.example/path", "https://preview.example/?next=other", "https://user@preview.example",
    "https://preview.example/#", "https://..", "https://256.256.256.256",
  ])("fecha o acesso quando a origem é ausente ou inválida (%s)", (origin) => {
    expect(dashboardLaunch("painel-comercial-r1", { ...preview, COMMERCIAL_PREVIEW_ORIGIN: origin })).toBeUndefined();
  });
});
