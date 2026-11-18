import type { Dashboard, Role } from "@/lib/domain";
import type { listManagedUsers } from "@/lib/postgres/administration";

type User = Awaited<ReturnType<typeof listManagedUsers>>[number];
const path = "/api/admin/access";
const roles: Record<Role, string> = {
  administrador: "Administrador",
  gestor: "Gestor",
  visualizador: "Visualizador",
};

function UserForm({ user }: { user?: User }) {
  return (
    <form className="access-form" action={path} method="post">
      <input type="hidden" name="action" value="user" />
      <label>
        ID de objeto no Entra
        <input name="objectId" defaultValue={user?.objectId} readOnly={!!user} required maxLength={36} />
      </label>
      <label>Nome<input name="name" defaultValue={user?.name} required maxLength={150} /></label>
      <label>E-mail<input name="email" type="email" defaultValue={user?.email} required maxLength={254} /></label>
      <label>
        Papel
        <select name="role" defaultValue={user?.role ?? "visualizador"}>
          {Object.entries(roles).map(([id, name]) => <option value={id} key={id}>{name}</option>)}
        </select>
      </label>
      <label>
        Acesso ao portal
        <select name="enabled" defaultValue={String(user?.enabled ?? false)}>
          <option value="false">Desativado</option>
          <option value="true">Ativo</option>
        </select>
      </label>
      <button type="submit" className="button secondary">{user ? "Salvar usuário" : "Cadastrar usuário"}</button>
    </form>
  );
}

export function AccessManagement({ users, dashboards, currentUserId }: {
  users: User[];
  dashboards: Dashboard[];
  currentUserId: string;
}) {
  return (
    <>
      <section className="panel grants-panel">
        <h2>Vincular usuário do Entra ID</h2>
        <UserForm />
      </section>
      {users.map((user) => (
        <section className="panel grants-panel" key={user.id}>
          <h2>{user.name}</h2>
          <UserForm user={user} />
          <h3>Concessões individuais</h3>
          {dashboards.length === 0 && <p>Nenhum dashboard cadastrado.</p>}
          {dashboards.map((dashboard) => {
            const hasGrant = user.dashboardIds.includes(dashboard.id);
            return (
              <form className="grant-row" action={path} method="post" key={dashboard.id}>
                <input type="hidden" name="action" value="grant" />
                <input type="hidden" name="userId" value={user.id} />
                <input type="hidden" name="dashboardId" value={dashboard.id} />
                <input type="hidden" name="granted" value={String(!hasGrant)} />
                <span>{dashboard.name}</span>
                <span className="category-chip">{hasGrant ? "Leitura concedida" : "Sem acesso"}</span>
                <button className="button secondary" type="submit">{hasGrant ? "Remover acesso" : "Conceder leitura"}</button>
              </form>
            );
          })}
          {currentUserId !== user.id && (
            <form action={path} method="post">
              <input type="hidden" name="action" value="revoke" />
              <input type="hidden" name="userId" value={user.id} />
              <button type="submit" className="button secondary">Revogar sessões</button>
            </form>
          )}
        </section>
      ))}
    </>
  );
}
