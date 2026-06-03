# Deploy do Partiu DF — Vercel (Web) + Railway (API + MySQL)

> Guia completo, passo a passo, para colocar o **Partiu DF** no ar sem VPS:
> **Web** (Next.js) na **Vercel** (grátis) e **API** (NestJS) + **MySQL** no **Railway** (~US$5/mês).
>
> Última atualização: 2026-06-02.

---

## 1. Por que essa arquitetura

O Partiu DF é um monorepo com **três peças que rodam ao mesmo tempo**:

| Peça | Tecnologia | Precisa de |
|---|---|---|
| **Web** | Next.js 15 | Servidor Node (SSR) |
| **API** | NestJS + Socket.IO | Processo Node 24/7 + WebSocket |
| **MySQL** | Prisma (adapter mariadb) | Banco de dados persistente |

Hospedagem compartilhada / "Site estático" **não roda** API NestJS, WebSocket nem MySQL.
Sem VPS, a solução é **separar cada peça** num serviço adequado:

```
                 Internet (HTTPS)
                       │
        ┌──────────────┴──────────────┐
        │                             │
   partiudf.vercel.app        SUA-API.up.railway.app
        │                             │
   ┌────▼────┐                  ┌─────▼─────┐
   │  WEB    │  ── fetch ─────▶ │   API     │
   │ Next.js │  ── WebSocket ─▶ │  NestJS   │
   │ (Vercel)│                  │ (Railway) │
   └─────────┘                  └─────┬─────┘
                                      │
                                ┌─────▼─────┐
                                │  MySQL    │
                                │ (Railway) │
                                └───────────┘
```

> **Ordem do deploy importa**: a Web precisa da URL da API, e a API precisa da URL da Web (CORS).
> Por isso: **Railway primeiro** (API + banco) → **Vercel depois** (web) → **ligar os dois** no fim.

---

## 2. Pré-requisitos

- Conta no **GitHub** com o repositório `TecnologiaDreamFactory/partiudf` (já existe).
- Conta no **Railway** — https://railway.app
- Conta na **Vercel** — https://vercel.com
- **Node.js 20+** instalado localmente (para rodar o seed via CLI).
- O repositório já está preparado para esse deploy:
  - `apps/api/Dockerfile` (API, porta dinâmica via `PORT`)
  - `apps/api/entrypoint.sh` (roda `prisma migrate deploy` no boot)
  - `package.json` com `packageManager: pnpm@9.14.2` e `pnpm.onlyBuiltDependencies` (libera build de `bcrypt`, `prisma`, `sharp`, etc.)

---

## 3. FASE 1 — Railway (MySQL + API)

### 3.1 Criar o banco MySQL

1. Acesse https://railway.app → **New Project**.
2. Escolha **Provision MySQL** (ou **Add a Database → MySQL**).
3. O banco sobe sozinho. **Não precisa configurar nada** nele agora.

### 3.2 Criar o serviço da API

1. No mesmo projeto → **New** → **GitHub Repo** → selecione `TecnologiaDreamFactory/partiudf`.
2. Abra **Settings** do serviço da API e configure:
   - **Root Directory**: `/` (a raiz — o Dockerfile copia a partir dela)
   - **Build → Dockerfile Path**: `apps/api/Dockerfile`
3. Abra **Variables** e adicione:

| Variável | Valor |
|---|---|
| `DATABASE_URL` | `${{MySQL.MYSQL_URL}}` (referência ao serviço MySQL) |
| `JWT_SECRET` | uma chave forte (ver 3.3) |
| `SEED_ADMIN_EMAIL` | email do admin (ex.: `ti@dreamfactory.com.br`) |
| `SEED_ADMIN_PASSWORD` | senha **numérica** forte (o login aceita só dígitos) |

> ⚠️ **Não** defina `PORT` (o Railway injeta automaticamente).
> ⚠️ **Não** defina `CORS_ORIGIN` ainda — isso é feito na Fase 3.

4. **Settings → Networking → Generate Domain** para a API ganhar uma URL pública
   (ex.: `partiudf-api.up.railway.app`). **Anote essa URL** — você vai usá-la na Fase 2.

### 3.3 Gerar o `JWT_SECRET`

No terminal local:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Copie o valor gerado e cole na variável `JWT_SECRET`.

### 3.4 Conferir o deploy

Nos **logs** do serviço da API no Railway, você deve ver:

```
[entrypoint] prisma migrate deploy
...
API running on port XXXX
```

Se aparecer erro de conexão com o banco, confira se `DATABASE_URL` está como `${{MySQL.MYSQL_URL}}`
e se o serviço MySQL está no mesmo projeto.

---

## 4. FASE 2 — Vercel (Web)

> Faça esta fase **somente depois** de ter a URL pública da API (Fase 1).

1. Acesse https://vercel.com → **Add New → Project** → importe `TecnologiaDreamFactory/partiudf`.
2. **Root Directory**: `apps/web` (a Vercel detecta Next.js + Turborepo automaticamente).
3. Em **Environment Variables**, adicione (troque pela URL real da API):

| Variável | Valor |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://SUA-API.up.railway.app` |
| `NEXT_PUBLIC_WS_URL` | `https://SUA-API.up.railway.app` |

> ⚠️ As variáveis `NEXT_PUBLIC_*` são **embutidas no build**. Se mudar a URL da API depois,
> é preciso **rebuildar** a web na Vercel (Deployments → Redeploy).

4. Clique em **Deploy**. Ao terminar, a Vercel te dá uma URL (ex.: `partiudf.vercel.app`).
   **Anote essa URL.**

### 4.1 Se o build da web falhar (fallback do monorepo)

A web depende do pacote `@partiudf/shared` (workspace). Se a Vercel não buildar o shared
automaticamente, ajuste em **Settings → Build & Development Settings**:

- **Build Command**: `cd ../.. && pnpm --filter @partiudf/shared build && pnpm --filter @partiudf/web build`
- **Install Command**: `cd ../.. && pnpm install --frozen-lockfile`

---

## 5. FASE 3 — Ligar os dois (CORS + admin)

### 5.1 Liberar o CORS na API

1. **Railway → serviço da API → Variables** → adicione:

| Variável | Valor |
|---|---|
| `CORS_ORIGIN` | URL da Vercel, com `https://` e **sem barra final** (ex.: `https://partiudf.vercel.app`) |

2. Salvar reinicia a API automaticamente (o CORS é lido no boot).
   Para mais de um domínio, separe por vírgula: `https://partiudf.vercel.app,https://www.seudominio.com`.

### 5.2 Criar o admin (seed — roda uma vez)

Na sua máquina, com a CLI do Railway:

```bash
npm i -g @railway/cli
railway login
railway link          # escolha o projeto e o serviço da API
railway run pnpm --filter @partiudf/api prisma:seed:prod
```

O seed usa as variáveis do Railway (`SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`) para criar o admin.

---

## 6. Verificação final

1. Abra `https://SUA-API.up.railway.app/health` → deve responder `{"ok":true,...}`.
2. Abra a URL da Vercel no navegador.
3. Faça **login** com o admin definido no seed (senha numérica).
4. Teste o fluxo principal: mapa, rastreamento GPS, WebSocket (atualização em tempo real).

> **PWA + geolocalização** só funcionam em **HTTPS** — Vercel e Railway já fornecem HTTPS por padrão. ✅

---

## 7. CI/CD (deploy automático)

- **Vercel**: cada `push` na branch `main` redeploya a web automaticamente.
- **Railway**: cada `push` na `main` redeploya a API automaticamente.
- Migrations rodam sozinhas no boot da API (`entrypoint.sh` → `prisma migrate deploy`).

---

## 8. Solução de problemas

| Sintoma | Causa provável | Correção |
|---|---|---|
| `ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING` | pnpm novo em Node antigo | Node 20+ no ambiente (já resolvido) |
| Corepack reclama da versão do pnpm | `packageManager` ≠ pnpm do ambiente | manter `pnpm@9.14.2` (já no repo) |
| `ignored build scripts` (bcrypt/prisma/sharp) | pnpm 10/11 bloqueia scripts nativos | `pnpm.onlyBuiltDependencies` (já no `package.json`) |
| API sobe mas web dá erro de CORS | `CORS_ORIGIN` errado | bater exatamente com a URL da Vercel (`https://`, sem barra) |
| WebSocket não conecta | `NEXT_PUBLIC_WS_URL` errado ou CORS | apontar para a URL da API e rebuildar a web |
| Login retorna 400/401 | senha não numérica ou admin não criado | senha só com dígitos; rodar o seed (5.2) |
| API não conecta no banco | `DATABASE_URL` errado | usar `${{MySQL.MYSQL_URL}}`; MySQL no mesmo projeto |

---

## 9. Custos estimados

| Item | Serviço | Custo |
|---|---|---|
| Web | Vercel (Hobby) | Grátis |
| API + MySQL | Railway | ~US$5/mês (uso) |
| HTTPS / SSL | Vercel + Railway | Grátis (automático) |
| Domínio próprio (opcional) | registrador | ~R$40–60/ano |

> Para domínio próprio: adicione o domínio na Vercel (web) e, se quiser `api.seudominio.com`,
> também no Railway — depois atualize `CORS_ORIGIN` e as `NEXT_PUBLIC_*` (com rebuild da web).

---

## 10. Checklist resumido

- [ ] Railway: criar projeto + MySQL
- [ ] Railway: criar serviço da API (Dockerfile `apps/api/Dockerfile`, root `/`)
- [ ] Railway: variáveis `DATABASE_URL`, `JWT_SECRET`, `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`
- [ ] Railway: gerar domínio público da API
- [ ] Vercel: importar repo, root `apps/web`, `NEXT_PUBLIC_API_URL` / `NEXT_PUBLIC_WS_URL`
- [ ] Vercel: deploy + anotar URL
- [ ] Railway: definir `CORS_ORIGIN` = URL da Vercel
- [ ] Rodar seed do admin (Railway CLI)
- [ ] Testar: `/health`, login, mapa, GPS, WebSocket, PWA no Android
