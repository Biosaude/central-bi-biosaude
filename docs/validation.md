# Validação da Fase 2

Execução em 3 de novembro de 2026, no checkout de `Biosaude/central-bi-biosaude`, branch `feat/central-bi-portal`. Node.js 24.22.1, npm 11.9.0, Next.js 16.4.4, Vitest 5.1.0 e Playwright 1.64.1. Navegador: Chromium instalado na máquina.

## Resultados

| Verificação | Execução | Resultado |
| --- | --- | --- |
| Persistência, seed, cadastro e edição | `npm run test` | Aprovado |
| Ativação, desativação, ordenação e slugs únicos | Vitest, SQLite em memória | Aprovado |
| Papéis, concessões individuais e negação por padrão | Vitest | Aprovado |
| Fronteira local: peer, Host, Origin, proxies e opt-in | Vitest | Aprovado |
| Total unitário | 1 arquivo, 11 testes | 11 aprovados; nenhum ignorado |
| TypeScript | `npm run typecheck` | Aprovado, sem erros |
| Build | `npm run build` (webpack, TypeScript habilitado) | Aprovado; 9 rotas, incluindo rota dinâmica e not-found |
| Compilação e execução em desenvolvimento | `npm run dev`, iniciado pela suíte Playwright | Aprovado; páginas renderizadas e mutações exercitadas |
| Portal e navegação entre páginas | Playwright no Chromium | Aprovado; sem erros JavaScript não tratados no fluxo |
| Cadastro, edição, ordem, ativação e rota dinâmica | Playwright; banco temporário isolado | Aprovado, com persistência entre requisições |
| Duplicidade e payload inválido | Playwright, API | 409, 400 e 404 esperados |
| Bloqueio de requisições entre origens e proxies | Playwright, API | 403 esperado |
| Bloqueio fora do desenvolvimento | Build iniciado com `npm run start`, opt-in e selo forjado presentes | GET/POST/PUT retornam 403; páginas negam acesso e não expõem cadastros |
| Módulos iniciais sem integração | Playwright nos 3 slugs | Mensagem de pendência visível; nenhum iframe ou requisição externa; nenhuma moeda financeira no conteúdo |
| Responsividade | Playwright, 390 × 844 | Navegação móvel funcional; sem overflow horizontal da página nas telas verificadas |
| Total de interface | 7 cenários | 7 aprovados; nenhum ignorado |
| Seed local repetido | Comando `db:seed`, executado duas vezes | 3 módulos em ambas as execuções, sem duplicação |
| Dependências de produção | `npm audit --omit=dev --audit-level=moderate` | 0 vulnerabilidades conhecidas reportadas |

As capturas desktop e móvel foram inspecionadas visualmente. São geradas em `test-results/portal-desktop.png` e `test-results/portal-mobile.png`, diretório ignorado pelo Git. Os testes de interface criam um quarto módulo somente no banco temporário; o banco local de uso manual mantém os três módulos iniciais.

## Correções durante a validação

- Habilitada a opção TypeScript necessária ao import `.ts` do script de seed e substituída uma parameter property por sintaxe suportada pelo strip de tipos nativo do Node.
- Ajustado o tipo dos cabeçalhos no teste de requisições maliciosas.
- A primeira execução de interface teve 6 cenários aprovados e 1 falha de seletor: o texto do rodapé fazia parte de uma frase maior. O teste passou a verificar o conteúdo no landmark de rodapé, preservando a asserção.
- Nomeada a navegação principal para identificação acessível e corrigida a precedência CSS do botão móvel.
- O sandbox inicial retornava stdout vazio para o subprocesso TypeScript iniciado pelo Next.js. A execução com suporte normal a subprocessos concluiu o build, sem ignorar erros, alterar dependências ou desabilitar verificações.

## Limites verificados

Não houve PR, merge, push ou deploy. A `main` e os três projetos de dashboards existentes não foram alterados. Não foram acessados bancos externos, serviços Supabase/Neon ou dados reais.

Esta validação demonstra o funcionamento do portal local. Não demonstra autenticação OIDC, sessões corporativas, permissões de usuários reais, funcionamento de dashboards integrados ou execução com PostgreSQL; esses recursos estão fora da Fase 2. A gestão de usuários/permissões é apenas uma consulta aos modelos fictícios. A aplicação de produção permanece fechada.

As dependências ficam no lockfile e os comandos reproduzíveis no [README](../README.md). A documentação de [arquitetura](architecture.md) descreve a política de autorização e o trabalho reservado à Fase 3.
