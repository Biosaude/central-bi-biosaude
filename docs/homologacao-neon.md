# PostgreSQL da homologação

## Destino autorizado

- Projeto Neon `central-bi-biosaude-homologacao` (`jolly-block-83042154`), AWS São Paulo e PostgreSQL 18.
- Branch raiz `production` (`br-blue-tooth-b65xm0io`) do projeto de homologação.
- Endpoint direto `ep-quiet-bird-b6xxmzh7.c-2.sa-east-1.aws.neon.tech:5432` e banco `neondb`.
- Projeto original `central-bi-biosaude` (`square-pine-83153325`).

## Papéis e segredos

| Variável | Uso |
|---|---|
| `DATABASE_URL` | Segredo do servidor Next.js. Usa o papel `central_bi_runtime` para sessões, catálogo, administração e inserção na auditoria. |
| `MIGRATION_DATABASE_URL` | Segredo do executor administrativo. Usa o papel `central_bi_migrator` para migrações e cadastro inicial. |
| `PORTAL_AUTH_MODE=entra` | Ativa o modo corporativo. |
| `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID`, `ENTRA_CLIENT_SECRET`, `ENTRA_REDIRECT_URI` | Aplicativo Web de tenant único no Microsoft Entra ID. Cadastre a URI HTTPS de homologação com o caminho `/api/auth/callback`. |
| `BOOTSTRAP_ENTRA_OBJECT_ID`, `BOOTSTRAP_ADMIN_NAME`, `BOOTSTRAP_ADMIN_EMAIL` | Variáveis temporárias do executor administrativo. Use o ID de **objeto do usuário** no tenant Entra autorizado. O e-mail é descritivo. |

Nas duas URLs use o endpoint direto indicado acima, o banco `neondb`, o papel correspondente e `?sslmode=verify-full`. As URLs ficam nos segredos de cada executor. Mantenha a URL de migração fora do servidor da aplicação e use credenciais exclusivas da homologação. A `NEON_API_KEY` serve à API de gerenciamento. O driver exige TLS com validação de cadeia e nome do servidor para o destino remoto.

## Passos para a janela autorizada

1. Confirme o ID do projeto e o vínculo entre branch, endpoint e banco na API do Neon. Use as credenciais de `neondb_owner` apenas para o provisionamento administrativo de homologação.
2. Conecte o `psql` com `PGHOST` igual ao endpoint acima, `PGPORT=5432`, `PGDATABASE=neondb`, `PGUSER=neondb_owner` e `PGSSLMODE=verify-full`. Verifique `current_database()`, `current_user` e as tabelas existentes antes de provisionar. Crie os dois papéis por SQL, com senhas distintas provisionadas pelo gerenciador de segredos. O comando interativo `\password` permite definir cada senha sem digitá-la numa instrução SQL.

   ```sql
   CREATE ROLE central_bi_migrator LOGIN NOINHERIT;
   CREATE ROLE central_bi_runtime LOGIN NOINHERIT;
   REVOKE CREATE, TEMPORARY ON DATABASE neondb FROM PUBLIC;
   REVOKE CREATE ON SCHEMA public FROM PUBLIC;
   GRANT CONNECT ON DATABASE neondb TO central_bi_migrator, central_bi_runtime;
   GRANT central_bi_migrator TO neondb_owner WITH SET TRUE;
   CREATE SCHEMA central_bi AUTHORIZATION central_bi_migrator;
   REVOKE SET OPTION FOR central_bi_migrator FROM neondb_owner;
   ```

   O migrador é dono apenas dos objetos da aplicação no schema dedicado. Os dois papéis devem ser criados sem privilégios administrativos. No Neon, a criação pela interface de gerenciamento pode incluir o papel `neon_superuser`, incompatível com este desenho.
3. No executor administrativo, configure `MIGRATION_DATABASE_URL`, rode `npm run db:migrate:postgres` e repita uma vez para confirmar que todas as migrações já foram aplicadas. Como `central_bi_migrator`, no mesmo endpoint e banco, use `psql -v ON_ERROR_STOP=1 -f db/operations/homologacao-runtime.sql` para aplicar os privilégios de execução. O arquivo valida o papel de execução antes de conceder acesso. Aplique-o após mudanças que alterem as permissões necessárias.
4. No mesmo executor, configure `ENTRA_TENANT_ID` e as três variáveis de bootstrap e rode `npm run db:bootstrap:admin`. Confirme o login desse administrador e as concessões usando contas de teste e registros sintéticos.

O papel de execução lê os registros necessários às operações da Central. O isolamento entre usuários é aplicado no servidor da aplicação. A credencial do servidor representa o portal inteiro e deve permanecer no executor da aplicação. A auditoria permite inserção pelo portal. Leitura, alteração e exclusão da trilha pelo mesmo papel ficam bloqueadas.

## Verificação local

A suíte de privilégios usa `PG_ROLE_TEST_MIGRATION_URL` e `PG_ROLE_TEST_RUNTIME_URL` em um PostgreSQL 18 descartável, com as mesmas definições de papéis e com o schema vazio pré-criado. O teste aplica as migrações, configura os privilégios e usa dados sintéticos. Use `127.0.0.1`, o banco `neondb` e os mesmos nomes de papéis. As URLs de teste podem omitir TLS no loopback.
