# Homologação corporativa dos dashboards

O catálogo mantém a autenticação Entra da Central e exige módulo ativo e concessão individual. O destino é uma origem HTTPS definida por módulo no servidor da Central. Sem uma origem de homologação válida, o catálogo Preview omite a ação. O endereço público do Comercial continua disponível no fluxo anterior fora de Preview.

| Aplicação | Repositório | Branch de trabalho | Referência do ambiente público documentada |
|---|---|---|---|
| Central | `Biosaude/central-bi-biosaude` | `feat/commercial-entitlement-api` | A origem canônica do Preview precisa ser confirmada na Vercel. |
| Comercial | `Biosaude/movopainelcomercial` | `feat/commercial-corporate-auth` | `movopainelcomercial.vercel.app` |
| Retenção | `Biosaude/Reten-o-de-Faturamento` | `feat/retention-corporate-preview` | `reten-o-de-faturamento.vercel.app` |
| Limite | `Biosaude/novo_limite_global_por_cliente` | `feat/global-limit-corporate-preview` | `novolimiteglobalporcliente.vercel.app` |

Retenção e Limite partiram, respectivamente, de `244544710ceeb5712da416f7341ef52373d509ab` e `efe35646bb894b805292416da377053047390d79` em `main`. As referências acima vêm dos repositórios. A atribuição e o estado atual das implantações não foram confirmados na Vercel.

## Contratos e isolamento

Cada dashboard mantém sessão corporativa própria. O Entra valida o tenant, a assinatura do ID token, PKCE, state e nonce. A sessão opaca expira em uma hora e pode ser revogada pelo endpoint de logout. Cada operação de leitura protegida reconsulta a Central, inclusive paginação, com asserção Ed25519 válida por 30 segundos e `jti` UUID de uso único. Fora do escopo Entra do Preview, os endpoints internos permanecem desativados.

| Módulo | Slug | `iss` e `sub` | Endpoint POST da Central |
|---|---|---|---|
| Comercial | `painel-comercial-r1` | `movopainelcomercial` | `/api/internal/commercial-entitlement` |
| Retenção | `retencao-faturamento` | `biosaude-retention` | `/api/internal/retention-entitlement` |
| Limite | `limite-global-cliente` | `biosaude-global-limit` | `/api/internal/global-limit-entitlement` |

O contrato usa `Authorization: Bearer`, sem corpo nem query, com `aud` igual à URL canônica do endpoint, `tid`, `oid`, `dashboard` fixo e `permission=dashboard:read`. A Central decide por conta habilitada, módulo ativo e concessão direta. Concessão ausente retorna `200 allowed:false`, token inválido ou reutilizado retorna 401 e indisponibilidade retorna 503. A tabela de replay existente é compartilhada para validar uso único, com as escritas limitadas a inserção e exclusão e sem alteração de schema. A migração 003 consta como aplicada e registrada conforme o histórico informado pelo solicitante. O runtime continua sem UPDATE. O banco autorizado da Central é `neondb`, projeto `jolly-block-83042154`, branch `br-blue-tooth-b65xm0io`.

- **Comercial.** O leitor server-only executa somente quatro consultas fixas via PostgreSQL e confere no banco que as RPCs e relações protegidas perderam acesso pelas roles de navegador. O histórico administrativo ainda requer autorização administrativa separada do Supabase. O SQL em `supabase/operations/commercial-preview-reader.sql` destina-se exclusivamente à base sintética. As RPCs existentes precisam da configuração de leitura que permite ao leitor executar suas consultas. Os privilégios de EXECUTE restritos bloqueiam o uso por `anon` e `authenticated`, mesmo com essa configuração. Acessos públicos no Supabase original seguem a política existente.
- **Retenção.** Um middleware Express protege todas as leituras da base atual e histórica, inclusive as rotas anteriormente públicas, antes do acesso ao Supabase. Exportação e publicação também passam pelo middleware. Operações que já exigiam perfil Supabase continuam exigindo esse perfil. O servidor requer configuração separada da base sintética sem fallback para as variáveis legadas. O Supabase deve manter RLS e revogação de tabelas e da RPC `replace_retention_dataset` para roles de navegador.
- **Limite.** Cada operação financeira deve apresentar a sessão corporativa autorizada e o JWT do Neon Auth de homologação. O servidor exige vínculo explícito entre `tid`, `oid` e o `sub` verificado do Neon. O próprio banco ainda decide associação ao workspace e permissão financeira na transação, com RLS, revisão e auditoria existentes. A lista de vínculos de Preview é destinada a um grupo de teste pequeno. O papel `biosaude_runtime_preview` é verificado em cada transação. O SQL `scripts/neon-corporate-preview-runtime-grants.sql` reproduz somente os grants do contrato financeiro no banco sintético isolado.

## Matriz única de configuração

Todas as linhas têm ambiente **Vercel Preview específico da branch de trabalho** da tabela inicial. `Existente` indica nome informado no inventário anterior da Central, sem confirmação do valor ou escopo. `Nova` indica variável introduzida nesta etapa. `A confirmar` indica variável que já existia no código e cujo estado no Preview escolhido não foi confirmado. As variáveis `VITE_` são públicas e contêm apenas flags ou identificador de workspace. Cada linha traz a ordem do checklist abaixo.

| Variável | Projeto | Obrigatoriedade | Situação | Dependência e ação |
|---|---|---|---|---|
| `PORTAL_AUTH_MODE` | Central | Sim | Existente | 2. Fixar `entra` para este Preview. |
| `ENTRA_TENANT_ID` | Central | Sim | Existente | 2. Conferir registro Web do Entra do tenant corporativo. Segredo somente no servidor. |
| `ENTRA_CLIENT_ID` | Central | Sim | Existente | 2. Conferir registro Web do Entra do tenant corporativo. Segredo somente no servidor. |
| `ENTRA_CLIENT_SECRET` | Central | Sim | Existente | 2. Conferir registro Web do Entra do tenant corporativo. Segredo somente no servidor. |
| `ENTRA_REDIRECT_URI` | Central | Sim | Existente | 2. Usar exatamente a origem deste Preview com `/api/auth/callback`. |
| `DATABASE_URL` | Central | Sim | Existente | 1. Vincular apenas o Neon de homologação, papel `central_bi_runtime`, TLS `verify-full`. |
| `COMMERCIAL_AUTH_MODE` | Comercial | Sim | A confirmar | 2. Ativar `preview` apenas nesta branch. |
| `COMMERCIAL_PREVIEW_ORIGIN` | Central | Sim | Nova | 5. Usar a origem canônica validada do dashboard, sem caminho, após testes de acesso direto. |
| `COMMERCIAL_PREVIEW_ORIGIN` | Comercial | Sim | A confirmar | 2. Usar a origem canônica do dashboard e registrar `/api/corporate-auth/callback` no Entra. |
| `COMMERCIAL_ENTRA_TENANT_ID` | Comercial | Sim | A confirmar | 2. Tenant único e aplicação Web de Preview. Manter credencial apenas no servidor. |
| `COMMERCIAL_ENTRA_CLIENT_ID` | Comercial | Sim | A confirmar | 2. Tenant único e aplicação Web de Preview. Manter credencial apenas no servidor. |
| `COMMERCIAL_ENTRA_CLIENT_SECRET` | Comercial | Sim | A confirmar | 2. Tenant único e aplicação Web de Preview. Manter credencial apenas no servidor. |
| `COMMERCIAL_SESSION_STORE_URL` | Comercial | Sim | A confirmar | 3. Endpoint Redis REST HTTPS do Preview. |
| `COMMERCIAL_SESSION_STORE_TOKEN` | Comercial | Sim | A confirmar | 3. Credencial segregada com `SET NX EX`, GET, GETDEL e DEL. |
| `CENTRAL_BI_ENTITLEMENT_URL` | Central e Comercial | Sim | A confirmar | 3. Igual nos dois lados. URL com `/api/internal/commercial-entitlement`; identificador próprio por serviço. |
| `CENTRAL_BI_ASSERTION_KEY_ID` | Central e Comercial | Sim | A confirmar | 3. Igual nos dois lados. URL com `/api/internal/commercial-entitlement`; identificador próprio por serviço. |
| `CENTRAL_BI_ASSERTION_PUBLIC_KEY` | Central | Sim | A confirmar | 3. Cadastrar apenas a pública Ed25519 PEM SPKI, com quebras de linha reais. |
| `CENTRAL_BI_ASSERTION_PRIVATE_KEY` | Comercial | Sim | A confirmar | 3. Cadastrar apenas a privada correspondente Ed25519 PEM PKCS#8, com quebras de linha reais. |
| `RETENTION_AUTH_MODE` | Retenção | Sim | Nova | 2. Ativar `preview` apenas nesta branch. |
| `RETENTION_PREVIEW_ORIGIN` | Central | Sim | Nova | 5. Usar a origem canônica validada do dashboard, sem caminho, após testes de acesso direto. |
| `RETENTION_PREVIEW_ORIGIN` | Retenção | Sim | Nova | 2. Usar a origem canônica do dashboard e registrar `/api/corporate-auth/callback` no Entra. |
| `RETENTION_ENTRA_TENANT_ID` | Retenção | Sim | Nova | 2. Tenant único e aplicação Web de Preview. Manter credencial apenas no servidor. |
| `RETENTION_ENTRA_CLIENT_ID` | Retenção | Sim | Nova | 2. Tenant único e aplicação Web de Preview. Manter credencial apenas no servidor. |
| `RETENTION_ENTRA_CLIENT_SECRET` | Retenção | Sim | Nova | 2. Tenant único e aplicação Web de Preview. Manter credencial apenas no servidor. |
| `RETENTION_SESSION_STORE_URL` | Retenção | Sim | Nova | 3. Endpoint Redis REST HTTPS do Preview. |
| `RETENTION_SESSION_STORE_TOKEN` | Retenção | Sim | Nova | 3. Credencial segregada com `SET NX EX`, GET, GETDEL e DEL. |
| `RETENTION_CENTRAL_BI_ENTITLEMENT_URL` | Central e Retenção | Sim | Nova | 3. Igual nos dois lados. URL com `/api/internal/retention-entitlement`; identificador próprio por serviço. |
| `RETENTION_CENTRAL_BI_ASSERTION_KEY_ID` | Central e Retenção | Sim | Nova | 3. Igual nos dois lados. URL com `/api/internal/retention-entitlement`; identificador próprio por serviço. |
| `RETENTION_CENTRAL_BI_ASSERTION_PUBLIC_KEY` | Central | Sim | Nova | 3. Cadastrar apenas a pública Ed25519 PEM SPKI, com quebras de linha reais. |
| `RETENTION_CENTRAL_BI_ASSERTION_PRIVATE_KEY` | Retenção | Sim | Nova | 3. Cadastrar apenas a privada correspondente Ed25519 PEM PKCS#8, com quebras de linha reais. |
| `GLOBAL_LIMIT_AUTH_MODE` | Limite | Sim | Nova | 2. Ativar `preview` apenas nesta branch. |
| `GLOBAL_LIMIT_PREVIEW_ORIGIN` | Central | Sim | Nova | 5. Usar a origem canônica validada do dashboard, sem caminho, após testes de acesso direto. |
| `GLOBAL_LIMIT_PREVIEW_ORIGIN` | Limite | Sim | Nova | 2. Usar a origem canônica do dashboard e registrar `/api/corporate-auth/callback` no Entra. |
| `GLOBAL_LIMIT_ENTRA_TENANT_ID` | Limite | Sim | Nova | 2. Tenant único e aplicação Web de Preview. Manter credencial apenas no servidor. |
| `GLOBAL_LIMIT_ENTRA_CLIENT_ID` | Limite | Sim | Nova | 2. Tenant único e aplicação Web de Preview. Manter credencial apenas no servidor. |
| `GLOBAL_LIMIT_ENTRA_CLIENT_SECRET` | Limite | Sim | Nova | 2. Tenant único e aplicação Web de Preview. Manter credencial apenas no servidor. |
| `GLOBAL_LIMIT_SESSION_STORE_URL` | Limite | Sim | Nova | 3. Endpoint Redis REST HTTPS do Preview. |
| `GLOBAL_LIMIT_SESSION_STORE_TOKEN` | Limite | Sim | Nova | 3. Credencial segregada com `SET NX EX`, GET, GETDEL e DEL. |
| `GLOBAL_LIMIT_CENTRAL_BI_ENTITLEMENT_URL` | Central e Limite | Sim | Nova | 3. Igual nos dois lados. URL com `/api/internal/global-limit-entitlement`; identificador próprio por serviço. |
| `GLOBAL_LIMIT_CENTRAL_BI_ASSERTION_KEY_ID` | Central e Limite | Sim | Nova | 3. Igual nos dois lados. URL com `/api/internal/global-limit-entitlement`; identificador próprio por serviço. |
| `GLOBAL_LIMIT_CENTRAL_BI_ASSERTION_PUBLIC_KEY` | Central | Sim | Nova | 3. Cadastrar apenas a pública Ed25519 PEM SPKI, com quebras de linha reais. |
| `GLOBAL_LIMIT_CENTRAL_BI_ASSERTION_PRIVATE_KEY` | Limite | Sim | Nova | 3. Cadastrar apenas a privada correspondente Ed25519 PEM PKCS#8, com quebras de linha reais. |
| `COMMERCIAL_PREVIEW_SUPABASE_URL` | Comercial | Sim | A confirmar | 1. Projeto sintético isolado e chave publicável dele. As variáveis legadas informadas para o Comercial não substituem estas. |
| `COMMERCIAL_PREVIEW_SUPABASE_PUBLISHABLE_KEY` | Comercial | Sim | A confirmar | 1. Projeto sintético isolado e chave publicável dele. As variáveis legadas informadas para o Comercial não substituem estas. |
| `COMMERCIAL_PREVIEW_READER_DATABASE_URL` | Comercial | Sim | Nova | 1. Leitor dedicado da mesma base Supabase, PostgreSQL direto ou session pooler porta 5432, `sslmode=verify-full`. |
| `VITE_RETENTION_CORPORATE_PREVIEW` | Retenção | Sim | Nova | 2. Definir `true` para ativar a tela de login no build. |
| `RETENTION_PREVIEW_SUPABASE_URL` | Retenção | Sim | Nova | 1. Usar o Supabase sintético da Retenção. Chave de serviço exclusivamente no servidor. |
| `RETENTION_PREVIEW_SUPABASE_ANON_KEY` | Retenção | Sim | Nova | 1. Usar o Supabase sintético da Retenção. Chave de serviço exclusivamente no servidor. |
| `RETENTION_PREVIEW_SUPABASE_SERVICE_ROLE_KEY` | Retenção | Sim | Nova | 1. Usar o Supabase sintético da Retenção. Chave de serviço exclusivamente no servidor. |
| `RETENTION_PUBLIC_IDENTIFIERS` | Retenção | Opcional | A confirmar | 1. Para mascarar identificadores sintéticos, definir `false`. A regra existente do dashboard é preservada. |
| `VITE_GLOBAL_LIMIT_CORPORATE_PREVIEW` | Limite | Sim | Nova | 2. Definir `true` para ativar a tela corporativa no build. |
| `GLOBAL_LIMIT_PREVIEW_NEON_HOST` | Limite | Sim | Nova | 1. Fixar o endpoint do Neon sintético do Limite e a URL `verify-full` com a role `biosaude_runtime_preview`. |
| `GLOBAL_LIMIT_PREVIEW_DATABASE_URL` | Limite | Sim | Nova | 1. Fixar o endpoint do Neon sintético do Limite e a URL `verify-full` com a role `biosaude_runtime_preview`. |
| `GLOBAL_LIMIT_PREVIEW_NEON_AUTH_BASE_URL` | Limite | Sim | Nova | 2. Usar um provedor Neon Auth de Preview com issuer exato e JWKS na mesma origem. |
| `GLOBAL_LIMIT_PREVIEW_AUTH_ISSUER` | Limite | Sim | Nova | 2. Usar um provedor Neon Auth de Preview com issuer exato e JWKS na mesma origem. |
| `GLOBAL_LIMIT_PREVIEW_AUTH_JWKS_URL` | Limite | Sim | Nova | 2. Usar um provedor Neon Auth de Preview com issuer exato e JWKS na mesma origem. |
| `GLOBAL_LIMIT_PREVIEW_AUTH_AUDIENCE` | Limite | Opcional | Nova | 2. Quando ausente o audience é o issuer. Definir se o provedor emitir outro audience. |
| `GLOBAL_LIMIT_PREVIEW_IDENTITY_BINDINGS` | Limite | Sim | Nova | 4. JSON de objetos com campos `tenantId`, `objectId`, `subject` para contas sintéticas. Vínculos únicos nos dois lados. |
| `FINANCIAL_API_ENABLED` | Limite | Sim | A confirmar | 4. Definir `true` para o serviço financeiro e o cliente remoto do Preview. |
| `VITE_FINANCIAL_REMOTE_ENABLED` | Limite | Sim | A confirmar | 4. Definir `true` para o serviço financeiro e o cliente remoto do Preview. |
| `VITE_FINANCIAL_WORKSPACE_ID` | Limite | Sim | A confirmar | 4. Fixar somente o workspace sintético com a associação Neon correspondente. |
| `VITE_ALLOW_LOCAL_FALLBACK` | Limite | Opcional | A confirmar | 4. Manter `false` no teste do fluxo remoto. |
| `FINANCIAL_DB_TRANSPORT` | Limite | Opcional | A confirmar | 1. Escolher `websocket` ou HTTP conforme conectividade verificada. Conferir em Preview usando o papel restrito. |
| `COMMERCIAL_CENTRAL_BI_VERCEL_BYPASS_TOKEN` | Comercial | Condicional | Nova | 3. Só se o Preview da Central exigir bypass de automação. |
| `RETENTION_CENTRAL_BI_VERCEL_BYPASS_TOKEN` | Retenção | Condicional | Nova | 3. Só se o Preview da Central exigir bypass de automação. |
| `GLOBAL_LIMIT_CENTRAL_BI_VERCEL_BYPASS_TOKEN` | Limite | Condicional | Nova | 3. Só se o Preview da Central exigir bypass de automação. |

## Checklist único de ativação e aceite

1. **Bases.** Confirmar visualmente a identidade de cada projeto e a separação de Production. Para a Central, validar metadados e arrolamento da 003 existente. Para o Comercial, após aprovação explícita, provisionar o leitor mínimo e aplicar o SQL de ACL somente no Supabase sintético. Validar TLS com verificação de hostname de dentro do Preview. Na Retenção, confirmar os grants do Supabase. No Limite, após aprovação explícita, provisionar o runtime do Preview e validar a proteção transacional e as políticas RLS existentes. Carregar somente dados sintéticos.
2. **Origens e identidade.** Identificar aliases Preview estáveis por branch e confirmar que o Vercel mantém Production em `main`. Conferir callbacks exatos do Entra para a Central e os dashboards nas origens canônicas, com credenciais exclusivas de homologação. Validar redirecionamento de ida e volta na mesma origem. No Limite, confirmar provedor e origens Neon Auth específicas do Preview.
3. **Serviço a serviço.** Pelo fluxo autorizado de segredos, provisionar um par Ed25519 por dashboard e Redis REST isolado por dashboard. Validar localmente assinatura e verificação de um desafio efêmero com o par. Configurar chave privada no dashboard e pública na Central. Conferir compatibilidade atômica do GETDEL. Permitir que os servidores cheguem ao endpoint exato da Central. Proteção de deployment da Vercel deve permitir a integração legítima sem afetar a autenticação no aplicativo. Se necessário, cadastrar o token de automação da Central só no servidor de cada cliente autorizado. Ele é enviado apenas ao endpoint fixo e a asserção Ed25519 continua obrigatória.
4. **Permissões e teste negativo.** Cadastrar usuários de teste habilitados e os três módulos pelos slugs documentados no ambiente de homologação. Conceder leitura apenas aos usuários de teste selecionados. No Limite, associar identidades de teste por identificadores imutáveis e verificar a associação independente ao workspace financeiro. Testar conta autorizada, conta sem concessão, revogação, sessão expirada, callback inválido, replay, falhas dos serviços e acesso direto a APIs, RPCs e views. Validar publicação separadamente com administrador de teste.
5. **Ativação e reversão.** Publicar exclusivamente em Preview em uma janela autorizada. Após validar as origens e os serviços, adicionar os links do catálogo. Validar filtros, gráficos, indicadores, histórico e exportações usando dados sintéticos. Em caso de falha, retirar do catálogo as origens do Preview afetado e remover o endereço interno da integração para suspender concessões. Manter as ACLs de proteção da base sintética ao reverter um deployment.

O release corporativo de Production exige habilitação explícita em uma alteração revisada. Os endpoints de concessão e os modos corporativos dos clientes descritos aqui foram preparados para Preview. A revisão deve confirmar os privilégios do backend da Retenção e a separação entre administração de publicação e concessão de leitura.

A publicação definitiva exige uma decisão sobre o encerramento dos caminhos públicos no release, incluindo as URLs antigas, rotas legadas, privilégios de execução das RPCs/views, dados previamente publicados e eventuais caches. A configuração precisa ser ensaiada em Preview, com os testes negativos passando em acesso direto e com revisão do desenho de vínculos Entra–Neon do Limite para a operação definitiva.
