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

## Escopo e próxima fase

Veja [arquitetura e segurança](docs/architecture.md) e [resultados dos testes](docs/validation.md). A Fase 3 depende de autorização: OIDC real, sessões, enforcement de concessões por usuário e migração para PostgreSQL/Neon ainda não foram implementados. Os outros três repositórios não são dependências e não foram alterados.

Trabalho na branch `feat/central-bi-portal`. Sem PR, merge, deploy ou alteração da `main`.
