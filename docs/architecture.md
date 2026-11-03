# Arquitetura e limites da Fase 2

## Fluxo demonstrativo local

O servidor de `scripts/dev.mjs` gera um selo aleatório por processo, escuta exclusivamente em `127.0.0.1` e remove qualquer selo enviado pelo cliente. Só injeta o selo interno quando a demonstração está explicitamente habilitada, o peer TCP é loopback, o Host é local na porta esperada e não há cabeçalhos de proxy. Requisições com Origin diferente ou `Sec-Fetch-Site: cross-site` não recebem autorização. Mutações exigem Origin local exata, inclusive em scripts HTTP.

As páginas e a API verificam no servidor: `NODE_ENV=development`, `LOCAL_DEMO_ENABLED=true` e igualdade do selo interno. Não há permissões derivadas de query string, cookie fictício, formulário de login, papel escolhido pelo cliente ou header público. O selo não é uma identidade e não é exposto ao JavaScript do navegador. `next dev` executado diretamente não gera esse selo e, portanto, nega acesso. A aplicação de produção nega a demonstração independentemente do opt-in e não abre o SQLite.

Este modo é uma ferramenta de desenvolvimento confiando nos processos locais da máquina, não uma autenticação corporativa. Um proxy ou túnel mal configurado pode transformar tráfego remoto em tráfego loopback sem cabeçalhos; por isso, não se deve publicar, encaminhar ou expor o servidor demonstrativo. O modo de produção permanece fechado até a implementação da Fase 3. Todo código com acesso ao processo/ambiente da máquina já pertence à fronteira local confiável.

O catálogo lê apenas registros ativos, em ordem crescente de `display_order`, nome e ID. O gerenciamento consulta também inativos. A rota dinâmica verifica o estado ativo novamente; esconder um link não é usado como controle de acesso. A API valida o schema com lista fechada de campos, limita o corpo a 8 KiB e usa consultas parametrizadas. Não existe campo de URL, renderização de HTML arbitrário, iframe ou cliente de integração externa. O tipo de integração é metadado sem execução.

As respostas da API não são armazenadas em cache. As páginas usam renderização dinâmica; o servidor local também configura `Cache-Control: no-store`. CSP bloqueia frames, objetos e conexões externas. A política de scripts permite inline/eval para o runtime local Next.js; uma política final com nonces deve ser avaliada na Fase 3 antes de qualquer publicação. Nenhuma credencial é gravada no código ou no seed.

## Persistência e evolução

O contrato `DashboardRepository` e os tipos de domínio separam a interface do banco. O adaptador SQLite está em `src/lib/sqlite.ts`, inclusive todas as consultas de usuários/vínculos. O caminho local é configurável. O schema contém dashboards, usuários, papéis, permissões, permissões por papel, concessões por usuário/dashboard, auditoria e versão de seed. Datas são ISO 8601; IDs e slugs são distintos; alterações e auditoria são transacionadas juntas. As relações têm chaves estrangeiras habilitadas.

O seed de versão 1 só adiciona os módulos iniciais uma vez. Reexecuções normais preservam alterações. Uma falha antes de completar o primeiro seed pode deixar módulos iniciais já criados, que serão reconhecidos pelo slug na próxima tentativa; execute a preparação antes de editar dados de um seed incompleto. O banco de teste unitário fica em memória e o E2E usa um arquivo temporário separado.

Na Fase 3, será necessário implementar um adaptador PostgreSQL com driver e migrações versionadas, sem copiar SQL específico de SQLite para as páginas. A interface síncrona atual é adequada à API SQLite; a troca por um driver de rede exigirá promover os métodos a `Promise` e aguardar os serviços nos chamadores. Não há alegação de compatibilidade direta com Neon nesta entrega. Também serão necessários controle de concorrência de edição, migração/importação explícita de dados aprovados, trilha de auditoria com sujeito autenticado e política de retenção.

## Identidade e permissões futuras

`IdentityProvider` define a obtenção de um principal verificado no servidor. A implementação atual sempre retorna `null`. `can()` nega por padrão: leitura exige concessão individual do slug para qualquer papel; gestão de dashboards/usuários exige administrador. Gestor e visualizador têm leitura apenas dos módulos concedidos. Nenhum desses papéis dá acesso de produção nesta fase e o modo local não simula um principal.

Os usuários `@example.invalid` e os vínculos persistidos ilustram o modelo. Não representam contas ativas, nem são usados para autorização demonstrativa. A interface de usuários é deliberadamente de consulta; não grava usuários ou permissões e não promete funcionamento de autenticação.

Pendências que exigem autorização para a Fase 3:

- Selecionar provedor OIDC e validar issuer, audience, assinatura, expiração, state/nonce e PKCE.
- Criar sessões seguras, logout e proteção CSRF adaptada ao fluxo corporativo.
- Resolver principal e concessões em todas as páginas, APIs e consultas, com negação por padrão e testes de isolamento entre usuários.
- Implementar gestão autenticada de usuários, papéis e permissões individuais; ator real na auditoria.
- Implementar PostgreSQL/Neon e migrações, com segredos via ambiente e infraestrutura aprovada.
- Aprovar logomarca oficial e revisar cabeçalhos, CSP e infraestrutura antes de eventual publicação.
- Definir integrações de dashboards separadamente, com autorização e análise de risco; tipos cadastrados não ativam integrações automaticamente.

Nenhum banco, API, layout, autenticação ou deploy dos projetos `movopainelcomercial`, `Reten-o-de-Faturamento` e `novo_limite_global_por_cliente` é acessado ou alterado.
