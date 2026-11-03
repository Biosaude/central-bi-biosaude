import { LockKeyhole, ShieldCheck } from "lucide-react";
import { PageHeading, Denied } from "@/components/ui";
import { localDemoAllowed } from "@/lib/page-access";
import { getRepository } from "@/lib/sqlite";
export const metadata = { title: "Usuários e permissões" };
export default async function UsersPage() {
  if (!(await localDemoAllowed())) return <Denied />;
  const repo = getRepository();
  const users = repo.listUsers();
  const grants = repo.listDemonstrativeGrants();
  return (
    <>
      <PageHeading
        eyebrow="GERENCIAMENTO"
        title="Usuários e permissões"
        description="A estrutura de acesso da central, preparada para a próxima fase."
      />
      <div className="demo-notice">
        <div className="notice-icon">
          <LockKeyhole size={20} />
        </div>
        <div>
          <strong>Estrutura demonstrativa · sem autenticação</strong>
          <p>
            Os registros abaixo são fictícios e não permitem login. Criação de
            usuários, atribuição de papéis e concessão de acesso ficam para a
            Fase 3.
          </p>
        </div>
        <span className="phase-tag">SOMENTE LEITURA</span>
      </div>
      <div className="role-grid">
        {[
          [
            "Administrador",
            "Conceito de gestão de módulos e usuários. A leitura de cada dashboard exige concessão individual.",
          ],
          [
            "Gestor",
            "Conceito de consulta aos dashboards expressamente autorizados. Sem gestão de usuários.",
          ],
          [
            "Visualizador",
            "Conceito de leitura dos módulos concedidos individualmente, sem operações administrativas.",
          ],
        ].map(([role, description]) => (
          <div className="panel" key={role}>
            <ShieldCheck size={23} className="red" />
            <h3>{role}</h3>
            <p className="muted">{description}</p>
          </div>
        ))}
      </div>
      <div className="section-heading">
        <h2>Usuários fictícios</h2>
        <span className="muted small">Nenhuma sessão ativa</span>
      </div>
      <div className="table-container">
        <table>
          <caption className="sr-only">
            Usuários exclusivamente demonstrativos
          </caption>
          <thead>
            <tr>
              <th>Nome</th>
              <th>E-mail fictício</th>
              <th>Papel previsto</th>
              <th>Autenticação</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>
                  <strong>{u.name}</strong>
                </td>
                <td>{u.email}</td>
                <td>{u.role}</td>
                <td>
                  <span className="category-chip">Não configurada</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <section className="panel grants-panel">
        <h2>Concessões individuais demonstrativas</h2>
        <p className="muted">
          Estes vínculos ilustram o modelo de persistência. Não concedem acesso
          autenticado nesta fase.
        </p>
        {grants.map((g, i) => (
          <div className="grant-row" key={i}>
            <span>{g.name}</span>
            <span>{g.dashboard}</span>
            <span className="category-chip">Leitura · modelo</span>
          </div>
        ))}
      </section>
    </>
  );
}
