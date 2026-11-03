import Link from "next/link";
export default function NotFound() {
  return (
    <div className="denied">
      <div className="eyebrow">404 · MÓDULO INDISPONÍVEL</div>
      <h1>Não encontramos esta página.</h1>
      <p>O endereço pode não existir ou o dashboard pode estar inativo.</p>
      <Link className="button secondary" href="/dashboards">
        Voltar ao catálogo
      </Link>
    </div>
  );
}
