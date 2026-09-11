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
| Mesas (CRUD + status + **liberar**) | ✅ | ✅ | ✅ |
| Pedidos, pagamento, cancelamento | ✅ | ✅ | ✅ |
| Próprio tema | ✅ | ✅ | ✅ |
| Próprio nome / login / senha | ❌ (403) | ✅ | ✅ |
| Produtos (CRUD + imagem) | ❌ | ✅ | ✅ |
| Caixa + Relatórios + vendas por categoria | ❌ | ✅ | ✅ |
| Funcionários | ❌ | só ATENDENTE | todos |
| Configurações / Logs / Usuários | ❌ | ❌ | ✅ |
| Limite de usuários (definir) | ❌ | ❌ | ✅ |

Regras críticas implementadas:
- ADMIN não cria/edita/desativa ADMIN nem DEV (403).
- **ATENDENTE não altera o próprio nome, login nem a própria senha** (403 no backend;
  a tela `/perfil` fica somente leitura, permitindo apenas alternar o tema). Somente
  ADMIN/DEV redefinem a senha de um atendente.
- Atendente não pode escalar a própria permissão: `POST /api/usuarios` exige ADMIN/DEV.
- Não é possível desativar/excluir o **único DEV ativo** →
  "Deve existir ao menos um Desenvolvedor ativo no sistema".
- Autodesativação bloqueada.
- Exclusão de usuário só DEV, e bloqueada se houver pedidos vinculados
  (histórico de pedidos nunca é apagado junto com o usuário).
- Atendente só cancela pedido próprio.

## Limite de usuários

Configuração `limiteUsuarios` (padrão **5**), editável apenas pelo DEV em
`/configuracoes` (`PUT /api/configuracoes/limiteUsuarios`, validado como inteiro ≥ 1).
Aplicado no backend em `POST /api/usuarios` contando **usuários ativos cadastrados**
(não sessões online): ao atingir o limite, o ADMIN recebe 400 com
"Limite de usuários atingido (X/Y). Entre em contato com o desenvolvedor para
aumentar o limite." O DEV não é limitado, então sempre consegue destravar o cadastro.
Não há como contornar pela interface — a regra vive na API.

## Modelo de dados (coleções Mongo, ids inteiros via `db.contadores`)

- `usuarios`: id, nome, usuario (único), senha (hash), role, tema, ativo, fotoUrl, criadoEm
- `mesas`: id, numero (único), status (LIVRE/OCUPADA/RESERVADA/MANUTENCAO), capacidade, observacao
- `produtos`: id, nome, descricao, preco, categoria (caldo/pastel/bebida/outro), imagemUrl, ativo, ordem
  - `PUT /api/produtos/{id}` usa `model_dump(exclude_unset=True)` (não `exclude_none`), para que
    `imagemUrl: null` / `descricao: null` sejam gravados e a remoção explícita funcione.
    Campos obrigatórios (nome, preco, categoria, ordem) são protegidos contra apagamento por null.
- `pedidos`: id, numeroComanda, **diaComanda** (YYYY-MM-DD), clienteNome, mesaId, atendenteId, status
  (ABERTO/PAGO/CANCELADO), observacao, canceladoMotivo, `itens[]` embutidos
  (produtoId, produtoNome, quantidade, **precoUnit congelado**, observacao),
  `pagamento` embutido (forma, valor, troco, pagoEm), criadoEm
- `caixa`: id, tipo (ENTRADA/SAIDA), valor, descricao, categoria, usuarioId, criadoEm
- `configuracoes`: chave/valor (mascaraComanda, nomeEstabelecimento, corPrimaria,
  corSecundaria, logoUrl, textoBotaoNovoPedido)
- `logs`: id, usuarioId, acao, detalhes, criadoEm
- `contadores`: `_id` = nome da sequência (`usuarios`, `mesas`, `produtos`, `pedidos`,
  `caixa`, `logs`, `comanda`)

Índices únicos: `usuarios.usuario`, `mesas.numero`, `pedidos.(diaComanda, numeroComanda)`.

## Geração da comanda

`routers/pedidos.py` → `gerar_numero_comanda()`:
1. lê `mascaraComanda` (padrão `###`);
2. `_proximo_numero_do_dia()` incrementa `db.contadores._id="comanda"` de forma
   atômica **e zera quando o dia virou** (campo `dia` comparado com
   `lib.dates.today_iso()`, ancorado no servidor — `APP_TZ=America/Sao_Paulo`);
3. conta `#` da máscara → `zfill`; substitui a sequência de `#`.
Exemplos: `###`+7 → `007`; `P-###`+15 → `P-015`; `A###B`+42 → `A042B`.

**A numeração reinicia em 001 no primeiro pedido de cada novo dia.** Cada pedido
guarda `diaComanda` (YYYY-MM-DD) e o índice único é o par
`(diaComanda, numeroComanda)` — então a comanda `001` de hoje e a `001` de ontem
coexistem sem conflito. A comanda impressa mostra a data para não confundir o
histórico. Se um número do dia já existir, o contador avança (segunda camada).
O DEV ainda pode zerar manualmente via
`PUT /api/configuracoes/resetar-contador-comanda` com `{ "confirmar": true }`.

## Pedido editável e Conta da Mesa

- `POST /api/pedidos/{id}/itens` — **soma** itens a uma comanda ABERTA sem criar
  outro pedido. Itens iguais (mesmo produto e mesma observação) somam a quantidade;
  o preço já congelado dos itens antigos é preservado e o novo item congela o preço
  atual. Bloqueia com 400 se o pedido não estiver ABERTO. Log `ADICIONOU_ITENS`.
  Na UI: `/pedidos` → Detalhes → "Adicionar itens".
- `GET /api/mesas/{id}/conta?pessoas=N` — conta única da mesa: soma **todas** as
  comandas ABERTAS, devolve os números das comandas, o total e o valor por pessoa.
- `POST /api/mesas/{id}/pagamento` — paga todas as comandas abertas da mesa de uma
  vez (`forma`, `valorRecebido` opcional, `pessoas` para registrar a divisão).
  Cada comanda recebe seu próprio `pagamento` e sua própria ENTRADA no caixa, com
  guarda atômica por comanda contra pagamento duplo. **Não libera a mesa.**
  Log `PAGOU_CONTA_MESA`. Na UI: `/mesas` → toque na mesa → "Conta da mesa".

## Fluxos principais

1. **Novo pedido** (`/pedidos/novo`): cliente opcional, mesa ou Balcão, abas por
   categoria (com miniatura do produto), carrinho com +/- e remover, total ao vivo,
   "Finalizar Pedido" → comanda gerada + modal de impressão.
   Se houver mesa, ela vira OCUPADA.
2. **Pagamento** (`/pedidos` → Detalhes → Confirmar Pagamento): forma
   DINHEIRO/PIX/CREDITO/DEBITO; em dinheiro calcula troco. Grava `pagamento`,
   status → PAGO, insere ENTRADA no caixa (categoria `venda`). Guarda atômica
   (`find_one_and_update` com `status: ABERTO`) contra pagamento duplo →
   "Este pedido já foi pago por outro usuário".
   **O pagamento NÃO libera a mesa** (ver "Liberação manual de mesa").
3. **Cancelamento**: motivo obrigatório (mín. 3 chars), só se ABERTO, libera a mesa.
4. **Caixa**: resumo do dia, lançamento de saída (ADMIN/DEV, mín. R$ 0,01),
   histórico filtrável, gráfico de entradas.
5. **Relatórios**: período, faturamento, ticket médio, ranking, pizza de formas de
   pagamento, exportar CSV, **separação Pastéis x Bebidas** (ver abaixo).

## Liberação manual de mesa

`PAGAMENTO ≠ LIBERAÇÃO`. O cliente pode pagar e continuar sentado, fazendo novos
pedidos na mesma mesa. A mesa só volta a LIVRE quando alguém aciona
`PATCH /api/mesas/{id}/liberar` (botão "Liberar mesa" no modal da mesa em `/mesas`,
disponível também ao ATENDENTE). A liberação é bloqueada (400) se ainda houver
pedido ABERTO na mesa, e registra log `LIBEROU_MESA`. O histórico de pedidos e
pagamentos da mesa é preservado após a liberação.

## Vendas por categoria (Pastéis x Bebidas)

`GET /api/caixa/vendas-categorias?dataInicio&dataFim&grupo&produtoId` (ADMIN/DEV).
O agrupamento reutiliza a **categoria já existente do produto** — nenhuma
classificação paralela foi criada:

- **Pastéis** ← categoria `pastel`
- **Bebidas** ← categorias `caldo` (caldo de cana) **e** `bebida`
- **Outros** ← categoria `outro`

Retorna `grupos[]` (quantidade + valor por grupo) e `produtos[]` (detalhe por
produto, com filtro opcional por grupo e/ou produto específico). O mesmo
agrupamento também vem em `grupos` no `GET /api/caixa/relatorio`.

## Rotas da API (todas sob `/api`)

- `auth`: POST `/auth/login`, GET `/auth/me`
- `usuarios`: GET ``, GET `/{id}`, POST ``, PUT `/{id}`, PUT `/{id}/senha`,
  PUT `/{id}/tema`, PATCH `/{id}/status`, DELETE `/{id}`
- `mesas`: GET ``, POST ``, PUT `/{id}`, PATCH `/{id}/status`,
  **GET `/{id}/conta`**, **POST `/{id}/pagamento`** (conta única da mesa),
  **PATCH `/{id}/liberar`** (liberação manual), DELETE `/{id}`
- `produtos`: GET `` (`?ativo=`, `?categoria=`), POST ``, PUT `/{id}`,
  PATCH `/{id}/status`, DELETE `/{id}`
- `pedidos`: GET `` (`?status`, `?dataInicio`, `?dataFim`, `?numeroComanda`,
  `?mesaId`, `?meus`), POST ``, GET `/{id}`, PUT `/{id}`,
  **POST `/{id}/itens`** (somar itens à comanda aberta),
  PATCH `/{id}/cancelar`, POST `/{id}/pagamento`, GET `/{id}/comanda`
- `caixa`: GET `/resumo`, GET `/movimentos`, POST `/movimentos`, GET `/relatorio`,
  **GET `/vendas-categorias`** (Pastéis x Bebidas + filtro por grupo/produto)
- `configuracoes`: GET `` (público), PUT `/{chave}` (DEV — inclui `limiteUsuarios`),
  PUT `/resetar-contador-comanda` (DEV)
- `dashboard`: GET `/atendente`, `/admin`, `/dev`
- `logs`: GET `` (DEV, `?usuarioId`, `?acao`)
- `comanda`: GET `/comanda/proxima` (preview da máscara)

## Telas

`/login`, `/` (dashboard por role), `/mesas`, `/pedidos/novo`, `/pedidos`,
`/perfil`, `/funcionarios`, `/produtos`, `/caixa`, `/relatorios`, `/usuarios`,
`/configuracoes`, `/logs`, 404 e "Acesso Negado" customizados.
Guia Rápido no botão "?" da barra superior, com seção extra por role.

`/pedidos` tem dois layouts no mesmo componente: **cards empilhados** abaixo de
`md` (botão "Detalhes" de largura total, altura 44px, sem scroll horizontal) e a
**tabela original** de `md` para cima, preservada como estava.

## Tema

`claro`/`escuro` via classe `dark` no `<html>`; persiste em `localStorage`
(`imperio_tema`) **e** no perfil do usuário (`PUT /api/usuarios/{id}/tema`).

## Imagens dos produtos (biblioteca de ícones)

Reutiliza o campo **já existente** `produtos.imagemUrl` — nenhuma tabela/campo novo.
`frontend/src/lib/iconesProdutos.ts` expõe 8 ícones servidos de
`frontend/public/marca/` (pastel, caldo de cana, água, refrigerante, suco, café,
salgado, genérico). Em `/produtos`, o formulário mostra a galeria clicável, um
preview, o campo de URL livre e o botão "Remover". No cardápio (`/pedidos/novo`) e
na grade de produtos a imagem aparece como miniatura; sem imagem usa o ícone padrão
da categoria e `onError` cai no placeholder — imagem quebrada nunca estraga o layout.

**Upload de arquivo não foi implementado** (decisão do usuário nesta rodada).

## Identidade visual

Logo e cartaz do cliente em `frontend/public/marca/logo-full.jpg`, usados **no lugar
do nome do estabelecimento** na tela de login (painel esquerdo no desktop, topo do
formulário no mobile). O ícone `icone.png` (copo de caldo + pastéis, recortado do
logo com o fundo verde removido) aparece na barra superior do app e como favicon
(`public/favicon.png`, 64px) e apple-touch-icon (`icone-180.png`).
A barra superior mostra também **a data do dia** (`topbar-data` no desktop,
`data-hoje-mobile` no mobile).

Miniaturas dos produtos no cardápio continuam vindo da biblioteca de ícones.
Total de assets ~0,5 MB, com `loading="lazy"` nas miniaturas.

## Impressão de comanda (58 mm)

`frontend/src/lib/impressao.ts` — três caminhos **reais**, sem simulação:

1. **Bluetooth** — Web Bluetooth (`navigator.bluetooth`), bytes ESC/POS enviados em
   pacotes de 180 bytes na primeira característica gravável.
2. **USB** — WebUSB (`navigator.usb`), ESC/POS via endpoint bulk OUT.
3. **Sistema operacional** — `window.print()` com `@page { size: 58mm auto }` e
   `.comanda-print` em 48 mm / 9pt monoespaçado.

`detectarSuporte()` lê as APIs de verdade e exige `window.isSecureContext`; os botões
de Bluetooth/USB ficam desabilitados quando a API não existe, com aviso explicando a
limitação. Texto ESC/POS formatado em 32 colunas e sem acentos (impressoras térmicas
simples não têm CP860 confiável).

### Reconexão GATT no Android (correção de bug)

No Android o GATT costuma cair nos primeiros instantes após o pareamento, gerando
`GATT Server is disconnected. Cannot retrieve services.` em `getPrimaryServices()`.
`imprimirBluetooth()` trata isso com:

1. `conectar()` — até 3 tentativas de `gatt.connect()` (idempotente) com atraso
   escalonado (`300ms × tentativa`) e checagem de `server.connected` antes de seguir;
2. listener de `gattserverdisconnected` que marca a queda para forçar reconexão em
   vez de falhar;
3. `obterCanalEscrita()` — 2 tentativas em volta de `getPrimaryServices()`, chamando
   `server.connect()` novamente quando `server.connected` é `false`;
4. `gatt.disconnect()` no `finally`, liberando o rádio para a próxima impressão.

A allowlist `SERVICOS_SERIAL` precisa cobrir os UUIDs usuais de impressora térmica:
com `acceptAllDevices`, `getPrimaryServices()` **só** devolve serviços allowlistados.

Cobertura de teste: `navigator.bluetooth` é mockado via `page.addInitScript` para
reproduzir a queda de GATT (ver checks `bt-reconnect-recovers-from-gatt-drop`,
`bt-permanent-failure-friendly-error`, `bt-cancel-chooser-not-error`). Hardware real
não é verificável em ambiente automatizado.

**Limitações reais**: Web Bluetooth/WebUSB não existem em iOS/Safari nem em Firefox —
nesses casos só o caminho 3 funciona. No desktop Linux/Windows, o driver de impressora
do sistema pode capturar o dispositivo USB e impedir o WebUSB.

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
