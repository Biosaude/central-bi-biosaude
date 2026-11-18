# Central de BI Biosaúde

Portal demonstrativo da Fase 2, com Next.js App Router, TypeScript, Tailwind CSS e SQLite local. Os três módulos iniciais são placeholders, sem integração, métricas financeiras, iframes, APIs ou bancos dos dashboards existentes.

## Executar localmente

Requisitos: Node.js 24 e npm. Use o checkout existente; não é necessário criar worktree.

```sh
npm ci
LOCAL_DEMO_ENABLED=true npm run dev
```

Abra `http://127.0.0.1:3000` **na máquina local**. O servidor escuta apenas em loopback. O opt-in é explícito: sem a variável, o portal mostra acesso negado. Não exponha a demonstração por túneis, proxies, portas públicas ou encaminhamentos. Não há login nem usuário autenticado.

O SQLite é criado automaticamente em `.local/central-bi.sqlite`, com dados fictícios. O seed é versionado: reiniciar não sobrescreve edições, ativações ou slugs alterados. Opcionalmente, prepare-o antes de iniciar:

```sh
NODE_ENV=development LOCAL_DEMO_ENABLED=true npm run db:seed
```

`LOCAL_SQLITE_PATH` pode selecionar outro arquivo SQLite **exclusivamente local**. Para reiniciar a demonstração, pare o servidor e remova somente o arquivo demonstrativo desejado; isso apaga os cadastros locais. Nunca use credenciais ou dados reais. `.env.example` documenta as variáveis; passe-as no comando ou exporte-as antes do `npm run dev`.

## Funcionalidades

- Página inicial, catálogo pesquisável por nome/descrição e categoria, rota `/dashboards/[slug]`, configurações e acesso negado.
- Cadastro, edição, ativação/desativação e ordem numérica dos dashboards. O menu e o catálogo refletem os registros ativos. Slugs únicos; módulos inativos ou inexistentes retornam 404 para o contexto local autorizado.
- Nome, descrição, ícone, categoria, ordem, status, integração futura e datas de criação/atualização persistidos. A alteração de slug muda o endereço.
- Usuários fictícios, papéis e concessões individuais em tela de consulta. Sem criação de contas, troca de identidade, login simulado ou concessões reais nesta fase.
- Auditoria transacional das alterações de dashboards, com ator técnico `local-demo`, nunca apresentado como pessoa autenticada.
- Layout responsivo, navegação móvel, foco visível, rótulos de formulários e mensagens de erro/sucesso.
- Identificação textual provisória e espaço para a logomarca oficial; nenhuma nova logomarca criada.

## Validação

```sh
npm run test
npm run typecheck
npm run build
npm run test:e2e
```

O build compila a aplicação e valida o TypeScript. O modo de desenvolvimento é iniciado e exercitado pelos testes Playwright. Execute o build antes do E2E: a suíte inicia um servidor demonstrativo na porta 3000 e outro com o build de produção na 3002 para confirmar o bloqueio. As portas devem estar livres. A suíte usa um banco isolado em diretório temporário, não o banco da demonstração manual.

Se houver Chromium em `/usr/bin/chromium`, a suíte o utiliza. Em outras máquinas execute `npx playwright install chromium` ou informe `PLAYWRIGHT_CHROMIUM_PATH` com o executável instalado. Não desative a verificação TLS para instalar dependências. Os relatórios e traces de falhas ficam em `test-results/`.

`npm run start` executa o build em loopback, com todas as operações e dados demonstrativos bloqueados, inclusive se `LOCAL_DEMO_ENABLED=true`. Não é um fluxo de publicação autorizado. Nenhum deploy é necessário.

## Estrutura

```text
src/
  app/
    page.tsx                         # visão geral
    dashboards/page.tsx              # catálogo
    dashboards/[slug]/page.tsx        # módulo dinâmico
    gerenciamento/dashboards/         # gestão local
    gerenciamento/usuarios/          # papéis e vínculos demonstrativos
    configuracoes/                   # estado do ambiente
    acesso-negado/                   # explicação de restrição
    api/dashboards/route.ts          # GET, POST e PUT protegidos
    globals.css                      # identidade e responsividade
  components/                        # shell, cards, catálogo e formulário
  lib/
    domain.ts                        # contratos, validação e política futura
    access.ts                        # autorização local no servidor
    page-access.ts                   # contexto de autorização das páginas
    sqlite.ts                        # adaptador, schema e seed fictício
scripts/
  dev.mjs                            # servidor local e selo interno por processo
  local-boundary.mjs                 # validação de peer, Host, Origin e proxy
  seed.ts                            # preparação idempotente do banco local
tests/
  unit/                              # persistência, validação e segurança
  e2e/                               # fluxos reais no Chromium
docs/
  architecture.md                    # fronteiras e pendências da Fase 3
  validation.md                      # resultados da execução
```

## Histórico da demonstração local

Veja [arquitetura e segurança](docs/architecture.md) e [resultados dos testes](docs/validation.md). Esses documentos registram a entrega da Fase 2. A seção seguinte descreve o modo corporativo da Fase 4D. Os outros três repositórios não são dependências da Central.

Trabalho na branch `feat/central-bi-portal`. Sem PR, merge, deploy ou alteração da `main`.

## Modo corporativo da Fase 4D

O modo corporativo é ativado com `PORTAL_AUTH_MODE=entra` e usa PostgreSQL. O demonstrativo SQLite continua disponível para desenvolvimento local. Configure `DATABASE_URL`, `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID`, `ENTRA_CLIENT_SECRET` e `ENTRA_REDIRECT_URI` no servidor. O retorno registrado no Entra deve apontar para `/api/auth/callback` no endereço canônico do portal, com HTTPS em homologação. Em testes locais, o retorno pode usar `http://localhost`.

1. Para validação local, aponte `MIGRATION_DATABASE_URL` para um PostgreSQL 18 descartável e execute `npm run db:migrate:postgres`. O executor registra cada migração com checksum e sua reexecução preserva o esquema aplicado.
2. Vincule o primeiro administrador com `npm run db:bootstrap:admin`, usando `ENTRA_TENANT_ID`, `BOOTSTRAP_ENTRA_OBJECT_ID`, `BOOTSTRAP_ADMIN_NAME` e `BOOTSTRAP_ADMIN_EMAIL`. O comando atua apenas se não houver outro administrador ativo no tenant. Depois, use **Usuários e permissões** para cadastrar os vínculos e conceder leitura por dashboard.
3. No modo corporativo, a identidade é o par `tid` e `oid`. A sessão opaca expira em até 8 horas e também após 30 minutos de inatividade. O logout encerra a sessão da Central. Administrações de acesso e alterações de dashboard são auditadas. O papel administrativo dá acesso à gestão, e a leitura de cada dashboard depende da respectiva concessão.
4. Testes de PostgreSQL em `npm test` usam `PG_TEST_DATABASE_URL` (banco `central_bi_local`) e `PG_AUTH_TEST_DATABASE_URL` (banco `central_bi_auth_local`). O cenário corporativo de `npm run test:e2e` usa `PG_CORPORATE_E2E_DATABASE_URL` (banco `central_bi_e2e_local`). Use bancos vazios e descartáveis em `127.0.0.1` a cada execução. O login é verificado com provedor simulado nos testes OIDC e a sessão é criada com identidades sintéticas no Playwright.

Para preparar o Neon de homologação, siga o [procedimento de banco e identidade](docs/homologacao-neon.md).
