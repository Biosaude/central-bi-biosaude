# Consulta interna da concessão do Comercial

O endpoint `POST /api/internal/commercial-entitlement` atende ao contrato do Comercial no commit `6aecf1f`. Ele recebe uma asserção de serviço em `Authorization: Bearer`. A requisição tem corpo e query vazios. O cookie da Central e a presença de sessão na Central são independentes dessa consulta.

A asserção aceita EdDSA com chave pública Ed25519 e `kid` configurado. `iss` e `sub` devem ser `movopainelcomercial`, e `aud` deve ser a URL exata deste endpoint. A validade é de 30 segundos, com `iat`, `exp` e `jti` UUID v4. O escopo é `dashboard=painel-comercial-r1` e `permission=dashboard:read`. Apenas o par `tid` e `oid` assinado pelo backend do Comercial entra na consulta. O tenant deve coincidir com o tenant da Central.

| Resposta | Significado |
|---|---|
| `200 {"allowed":true}` | Conta habilitada, módulo ativo e concessão individual vigente. |
| `200 {"allowed":false}` | Ausência de autorização. O papel administrativo não concede leitura automaticamente. |
| `401` | Asserção ausente, inválida, expirada ou já usada, ou destino divergente. |
| `400` | Corpo ou query fora do contrato. |
| `503` | Configuração ou PostgreSQL indisponível. O Comercial deve bloquear a leitura. |
| `404` | Endpoint desativado. A configuração fica desativada em Production na Vercel e fora do modo corporativo. |

As respostas usam `Cache-Control: private, no-store`. Cada pedido com uma asserção nova verifica a concessão no PostgreSQL. O registro de uso único armazena somente `jti` e expiração. A reserva atômica e a decisão são feitas na mesma instrução. As entradas expiradas são removidas durante consultas posteriores. Os identificadores de usuário e as asserções completas não são armazenados nessa tabela.

## Configuração de homologação

- No servidor da Central, configure `PORTAL_AUTH_MODE=entra`, `ENTRA_TENANT_ID` e a `DATABASE_URL` de homologação com o papel já definido `central_bi_runtime`. As variáveis HTTPS abaixo devem ser específicas do Preview. Para testes locais, o endpoint pode usar `http://localhost` com a porta do servidor.
- Use o mesmo `CENTRAL_BI_ENTITLEMENT_URL` e `CENTRAL_BI_ASSERTION_KEY_ID` no Comercial e na Central. A URL deve apontar para o host canônico exato do Preview. Configure `CENTRAL_BI_ASSERTION_PUBLIC_KEY` na Central com a chave pública PEM SPKI Ed25519. A chave privada pertence somente ao servidor do Comercial.
- A migração `003_commercial_entitlement_replay.sql` e os privilégios necessários foram informados como aplicados no Neon de homologação `jolly-block-83042154`. Use a tabela e o papel existentes.
- Consulte o [checklist consolidado](homologacao-dashboards.md) para a validação do acesso direto no Supabase, roteamento e conectividade de Preview.

Para desativar a integração em homologação, remova `CENTRAL_BI_ENTITLEMENT_URL` dessa configuração. O catálogo e as rotas corporativas da Central continuam independentes do endpoint.
