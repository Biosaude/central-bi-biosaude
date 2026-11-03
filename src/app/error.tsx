"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="denied">
      <h1>Não foi possível carregar a central.</h1>
      <p>
        Verifique a configuração local e tente novamente. Nenhum detalhe interno
        é exibido nesta tela.
      </p>
      <button className="button secondary" onClick={reset}>
        Tentar novamente
      </button>
    </div>
  );
}
