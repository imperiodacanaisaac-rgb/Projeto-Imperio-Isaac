# Império Da Cana — Sistema de Gestão

Aplicação full-stack de gestão para um estabelecimento de caldo de cana e pastel:
comandas, mesas, pedidos, pagamentos, caixa, relatórios e configuração do sistema.

## Stack real (template deste ambiente)

O documento original pedia Node/Express/Prisma/SQLite. O usuário aprovou manter o
stack do template: **FastAPI + MongoDB (motor) + React 19 + TypeScript + Tailwind v4
+ shadcn/ui**. Todas as regras de negócio, permissões e telas do documento foram
implementadas nesse stack.

- Backend: `backend/` — rotas em `backend/routers/*`, modelos Pydantic v2 em
  `backend/models/schemas.py`, helpers em `backend/lib/auth.py`. Tudo sob `/api`.
- Frontend: `frontend/src/pages/*` (telas), `frontend/src/components/*`,
  `frontend/src/context/AuthContext.tsx`, tipos espelhados em `frontend/src/lib/types.ts`.
- Seed idempotente: `cd /app/backend && python seed.py`.

## Autenticação

- JWT Bearer (HS256, 8h), segredo em `backend/.env` → `JWT_SECRET`.
- Token guardado em `localStorage` (`imperio_token`), enviado por `lib/api.ts`.
- `401` em qualquer chamada (exceto login) limpa o token e redireciona a
  `/login?expirada=1`.
- Senhas com bcrypt (rounds 10) — o hash nunca sai em resposta de API.
- Rate limit no login: 10 tentativas / 15 min por IP (429).
- Rota pública: `GET /api/configuracoes` (nome/logo/cores antes do login).

## Perfis e permissões

| Recurso | ATENDENTE | ADMIN | DEV |
|---|---|---|---|
| Mesas (CRUD + status) | ✅ | ✅ | ✅ |
| Pedidos, pagamento, cancelamento | ✅ | ✅ | ✅ |
| Próprio perfil/senha/tema | ✅ | ✅ | ✅ |
| Produtos (CRUD) | ❌ | ✅ | ✅ |
| Caixa + Relatórios | ❌ | ✅ | ✅ |
| Funcionários | ❌ | só ATENDENTE | todos |
| Configurações / Logs / Usuários | ❌ | ❌ | ✅ |

Regras críticas implementadas:
- ADMIN não cria/edita/desativa ADMIN nem DEV (403).
- Não é possível desativar/excluir o **único DEV ativo** →
  "Deve existir ao menos um Desenvolvedor ativo no sistema".
- Autodesativação bloqueada.
- Exclusão de usuário só DEV, e bloqueada se houver pedidos vinculados.
- Atendente só cancela pedido próprio.

## Modelo de dados (coleções Mongo, ids inteiros via `db.contadores`)

- `usuarios`: id, nome, usuario (único), senha (hash), role, tema, ativo, fotoUrl, criadoEm
- `mesas`: id, numero (único), status (LIVRE/OCUPADA/RESERVADA/MANUTENCAO), capacidade, observacao
- `produtos`: id, nome, descricao, preco, categoria (caldo/pastel/bebida/outro), imagemUrl, ativo, ordem
- `pedidos`: id, numeroComanda (único), clienteNome, mesaId, atendenteId, status
  (ABERTO/PAGO/CANCELADO), observacao, canceladoMotivo, `itens[]` embutidos
  (produtoId, produtoNome, quantidade, **precoUnit congelado**, observacao),
  `pagamento` embutido (forma, valor, troco, pagoEm), criadoEm
- `caixa`: id, tipo (ENTRADA/SAIDA), valor, descricao, categoria, usuarioId, criadoEm
- `configuracoes`: chave/valor (mascaraComanda, nomeEstabelecimento, corPrimaria,
  corSecundaria, logoUrl, textoBotaoNovoPedido)
- `logs`: id, usuarioId, acao, detalhes, criadoEm
- `contadores`: `_id` = nome da sequência (`usuarios`, `mesas`, `produtos`, `pedidos`,
  `caixa`, `logs`, `comanda`)

Índices únicos: `usuarios.usuario`, `mesas.numero`, `pedidos.numeroComanda`.

## Geração da comanda

`routers/pedidos.py` → `gerar_numero_comanda()`:
1. lê `mascaraComanda` (padrão `###`);
2. incrementa atomicamente `db.contadores._id="comanda"` (`findOneAndUpdate $inc`);
3. conta `#` da máscara → `zfill`; substitui a sequência de `#`.
Exemplos: `###`+7 → `007`; `P-###`+15 → `P-015`; `A###B`+42 → `A042B`.
Índice único em `numeroComanda` é a segunda camada; se colidir, o contador avança.
O contador **nunca** reseta automaticamente — só DEV via
`PUT /api/configuracoes/resetar-contador-comanda` com `{ "confirmar": true }` (gera log).

## Fluxos principais

1. **Novo pedido** (`/pedidos/novo`): cliente opcional, mesa ou Balcão, abas por
   categoria, carrinho com +/- e remover, total ao vivo, "Finalizar Pedido" →
   comanda gerada + modal de impressão (`window.print`, CSS `@media print`).
   Se houver mesa, ela vira OCUPADA.
2. **Pagamento** (`/pedidos` → Detalhes → Confirmar Pagamento): forma
   DINHEIRO/PIX/CREDITO/DEBITO; em dinheiro calcula troco. Grava `pagamento`,
   status → PAGO, insere ENTRADA no caixa (categoria `venda`), libera a mesa
   se não houver outro pedido ABERTO nela. Guarda atômica
   (`find_one_and_update` com `status: ABERTO`) contra pagamento duplo →
   "Este pedido já foi pago por outro usuário".
3. **Cancelamento**: motivo obrigatório (mín. 3 chars), só se ABERTO, libera a mesa.
4. **Caixa**: resumo do dia, lançamento de saída (ADMIN/DEV, mín. R$ 0,01),
   histórico filtrável, gráfico de entradas.
5. **Relatórios**: período, faturamento, ticket médio, ranking, pizza de formas de
   pagamento, exportar CSV.

## Rotas da API (todas sob `/api`)

- `auth`: POST `/auth/login`, GET `/auth/me`
- `usuarios`: GET ``, GET `/{id}`, POST ``, PUT `/{id}`, PUT `/{id}/senha`,
  PUT `/{id}/tema`, PATCH `/{id}/status`, DELETE `/{id}`
- `mesas`: GET ``, POST ``, PUT `/{id}`, PATCH `/{id}/status`, DELETE `/{id}`
- `produtos`: GET `` (`?ativo=`, `?categoria=`), POST ``, PUT `/{id}`,
  PATCH `/{id}/status`, DELETE `/{id}`
- `pedidos`: GET `` (`?status`, `?dataInicio`, `?dataFim`, `?numeroComanda`,
  `?mesaId`, `?meus`), POST ``, GET `/{id}`, PUT `/{id}`, PATCH `/{id}/cancelar`,
  POST `/{id}/pagamento`, GET `/{id}/comanda`
- `caixa`: GET `/resumo`, GET `/movimentos`, POST `/movimentos`, GET `/relatorio`
- `configuracoes`: GET `` (público), PUT `/{chave}` (DEV),
  PUT `/resetar-contador-comanda` (DEV)
- `dashboard`: GET `/atendente`, `/admin`, `/dev`
- `logs`: GET `` (DEV, `?usuarioId`, `?acao`)
- `comanda`: GET `/comanda/proxima` (preview da máscara)

## Telas

`/login`, `/` (dashboard por role), `/mesas`, `/pedidos/novo`, `/pedidos`,
`/perfil`, `/funcionarios`, `/produtos`, `/caixa`, `/relatorios`, `/usuarios`,
`/configuracoes`, `/logs`, 404 e "Acesso Negado" customizados.
Guia Rápido no botão "?" da barra superior, com seção extra por role.

## Tema

`claro`/`escuro` via classe `dark` no `<html>`; persiste em `localStorage`
(`imperio_tema`) **e** no perfil do usuário (`PUT /api/usuarios/{id}/tema`).

## Desvios conscientes do documento original

- Stack FastAPI/MongoDB em vez de Express/Prisma/SQLite (aprovado pelo usuário);
  portas do template (8001/3000) em vez de 3001/5173.
- Autenticação por Bearer token em `localStorage`, com `fetch` tipado
  (`lib/api.ts`) em vez de Axios; toasts com `sonner` em vez de `react-hot-toast`.
- Validação com Pydantic v2 em vez de express-validator; rate limit em memória
  no processo em vez de `express-rate-limit`.
- Itens do pedido e pagamento são documentos embutidos no pedido (Mongo), não
  tabelas separadas — o `precoUnit` continua congelado na venda.
- Tabelas não têm paginação de UI (listas limitadas no backend).
