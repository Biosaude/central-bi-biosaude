import Link from "next/link";
import { ArrowRight, LockKeyhole } from "lucide-react";
import { corporateEnabled } from "@/lib/corporate";

export function Denied() {
  const corporate = corporateEnabled();
  return (
    <div className="denied">
      <span className="module-icon">
        <LockKeyhole size={30} />
      </span>
      <div className="eyebrow">ACESSO RESTRITO</div>
      <h1>Acesso negado</h1>
      {corporate ? (
        <>
          <p>Entre com sua conta corporativa. O acesso depende de uma concessão da Central.</p>
          <a className="button secondary" href="/api/auth/login">Entrar com Microsoft</a>
        </>
      ) : (<>
      <p>
        Esta funcionalidade está disponível apenas na demonstração local
        autorizada. A autenticação corporativa será implementada na Fase 3.
      </p>
      <p>Não há sessão de usuário autenticada nem acesso a dados reais.</p>
      <Link className="button secondary" href="/acesso-negado">
        Informações de acesso <ArrowRight size={16} />
      </Link>
      </>)}
    </div>
  );
}
