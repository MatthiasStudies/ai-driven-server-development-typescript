# Plan: tcg-card-stack — TypeScript/Hono TCG card collection server

Source of requirements: `project.md` in the repo root. This plan is the agreed
implementation blueprint; it incorporates all clarification decisions made with the user
during planning (including the port and filter-op decisions).

## 1. Current state

- TypeScript ESM project (Node >= 24), `type: module`, strict TS (`noUncheckedIndexedAccess`, `verbatimModuleSyntax`)
- `drizzle-orm` 0.45 + `drizzle-kit`, `pg` (node-postgres), schema mirrors `postgres-data/init.sql` in `src/db/schema/` (`binders`, `cards`, `grading_certificates`, relations)
- `src/db/client.ts`: drizzle client over `pg.Pool`, requires `DATABASE_URL`
- No HTTP server yet; no auth; `tsx` available for dev
- `postgres-data/init.sql`: schema + seed data (3 binders, 8 cards, 4 certificates)
- Keycloak realm `tcg-card-stack` at `http://localhost:8080`, public client `tcg-backend`
  (PKCE + direct access grants), realm role `collector`, user `collector`/`collector` (sub `004dd70a-0aa1-4402-b1da-74e4311360f5`)
- Docker services running: Postgres at `localhost:5432`, Keycloak at `localhost:8080`
- `esdb` previously held host port 3000 but has been stopped — the API will use port 3000
- One commit (`initial commit`); `project.md` untracked

## 2. Locked-in decisions

| Topic | Decision |
|---|---|
| Port | **3000** (esdb stopped) |
| Stack | Hono + `@hono/node-server`, **h2c HTTP/2** via `node:http2` (`allowHTTP1: true`, plain `createServer`) — HTTP/1.1 clients (Bruno, curl) still work; HTTP/2 via `curl --http2-prior-knowledge` |
| Schema changes | **Approved**: add `created_at`/`updated_at` to `cards` and `grading_certificates`, `updated_at` to `binders`. Update `init.sql` + Drizzle schema; recreate DB via `docker compose down -v && up -d` (destroys/reseeds data — approved) |
| Timestamps | Drizzle `defaultNow()` for `created_at`; `updated_at` via `$onUpdate(() => new Date())` (all writes go through Drizzle; init.sql gets `DEFAULT now()` too) |
| Authorization | Keycloak JWT (JWKS from `…/realms/tcg-card-stack/protocol/openid-connect/certs`, issuer check), realm role `collector` required on all API routes; `/health` public |
| Ownership | Enforced: binders filtered/limited to `owner_user_id = sub`; cards scoped via their binder (join); creating a binder stamps `owner_user_id = sub`; card writes require owning the target binder |
| Endpoints | `GET/POST /binders`, `GET/PUT /binders/:id`, `GET/POST /cards`, `GET/PUT /cards/:id`, `POST /cards/:cardId/grading-certificate`, `GET /health` |
| HTTP semantics | Conditional GET (`If-None-Match` → 304); POST → `201` + `Location`; PUT requires `If-Match` (optimistic locking via `version`) |
| ETag | Strong ETag `"<resource>-<id>-v<version>"` e.g. `"card-3-v7"`; flips on every successful PUT |
| PUT semantics | Full replacement (all fields required); `If-Match` mismatch → 412; missing id → 404 |
| Pagination | `?page=1&pageSize=20` (max 100); response envelope `{ data: [...], meta: { page, pageSize, total, totalPages } }` |
| Sorting | `sort=-name,createdAt` (whitelisted fields per resource, `-` = desc) |
| Filtering | `filter.<field>.<op>=value`, ops: `eq`, `ne`, `in` (comma-separated), `contains` (case-insensitive ILIKE), `gte`, `lte`; all zod-validated |
| Certificates | One per card (DB UNIQUE); second POST → `409`; duplicate `cert_number` → `409`; no update/delete endpoint |
| Errors | RFC 9457 `application/problem+json` for all error paths; zod failures → 400 with `errors` array |
| Tests | Vitest **unit tests only** — no live-DB tests (user choice). Bruno collection is the HTTP-level verification (spec allows either; Bruno explicitly requested) |
| PUT `If-Match` | Required; format matches the ETag string emitted by GETs |
| Bruno | `bruno/` collection committed; token via "Get Token" request (password grant) with post-response script storing `access_token` in environment |
| Commits | **"Commit early, commit often"** — small, self-contained commits after every working step (not just per numbered phase; e.g. schema change, then server skeleton, then each route module, then tests, then docs). Never leave a green build uncommitted; commit messages in conventional style (`feat:`, `chore:`, `test:`, `docs:`) |

## 3. Dependencies to add

Runtime: `hono`, `@hono/node-server`, `zod`, `@hono/zod-validator`, `jose`.
Dev: `vitest`.
(No Drizzle migrations — `init.sql` remains source of truth.)

## 4. Target structure

```
src/
  index.ts                # entrypoint: env, start h2c server
  app.ts                  # builds Hono app (exported for tests), error handler, /health
  env.ts                  # zod-validated env (PORT, DATABASE_URL, KEYCLOAK_ISSUER, KEYCLOAK_JWKS_URL)
  auth/keycloak.ts        # jose createRemoteJWKSet verification, collector role middleware
  http/problem.ts         # RFC 9457 helpers (problem titles, handler → application/problem+json)
  http/etag.ts            # ETag build/parse, If-None-Match / If-Match handling
  http/list.ts            # zod schemas for page/pageSize/sort/filter.*, envelope builder, SQL builders
  http/validate.ts        # zod-validator wrapper mapping issues → 400 problem details
  repositories/
    binders.ts            # owner-scoped queries
    cards.ts              # owner-scoped via join on binders
    certificates.ts
  routes/
    binders.ts
    cards.ts
    grading-certificates.ts
    health.ts
test/                     # Vitest unit tests (no live DB)
  etag.test.ts
  list.test.ts            # pagination/filter/sort parsing
  problem.test.ts
  auth.test.ts            # role check with fabricated JWTs (jose mocked/stubbed JWKS)
  schemas.test.ts         # zod request schemas
  routes.test.ts          # handlers with stubbed repositories (app.request)
bruno/                    # collection: bruno.json, environments/local.bru, requests
Makefile
```

## 5. API surface

Root-level (no `/api` prefix): `/health`, `/binders`, `/cards`, `/cards/:cardId/grading-certificate`.

| Endpoint | Behavior |
|---|---|
| `GET /health` | `{ status: "ok" }` — public, no auth |
| `POST /binders` | zod body `{ name (≤100), description? }`; stamps `owner_user_id = sub`; `201` + `Location: /binders/:id` + `ETag` |
| `GET /binders` | owner-scoped list; filters e.g. `filter.name.contains\|eq\|ne`, `filter.createdAt.gte\|lte`; `sort` whitelist: `name, createdAt, updatedAt`; paginated envelope + `ETag`; `If-None-Match` → 304 |
| `GET /binders/:id` | owner-scoped detail; embeds `cards` summary (1:N) |
| `PUT /binders/:id` | full replace `{ name, description? }`; requires `If-Match`; `UPDATE … WHERE id=? AND version=?` (`version+1`, `updated_at=now()`); 404 if missing, 412 on mismatch |
| `POST /cards` | body `{ binderId, name, setName, collectorNumber, rarity, variant?, acquiredAt? }`; binder must exist and belong to caller (else 404); `201` + `Location` + `ETag` |
| `GET /cards` | owner-scoped list (join binders on owner); filters: `filter.name/setName/rarity/variant/collectorNumber .eq/.ne/.contains/.in`, `filter.acquiredAt.eq/gte/lte`, `filter.binderId.eq/in`; sort whitelist: `name,setName,rarity,acquiredAt,createdAt,updatedAt`; pagination; ETag/304 |
| `GET /cards/:id` | detail incl. owner check; embeds `gradingCertificate` (1:1) if present |
| `PUT /cards/:id` | full replace; may move to another binder (must be owned); `If-Match` + version bump; 404/412 as above |
| `POST /cards/:cardId/grading-certificate` | body `{ gradingCompany (≤20), certNumber (≤50), grade (1.0–10.0, 0.1 steps), gradedAt (date) }`; 409 if card already has a cert or cert_number taken; card must be owned; `201` + `Location: /cards/:cardId/grading-certificate` |

Validation: zod everywhere (params, query, body). Grade: `z.number().min(1).max(10)` with 0.1-step check (via string regex or rounded-multiple validation).
Dates as ISO `YYYY-MM-DD` strings validated by zod.

## 6. Auth details

- Env: `KEYCLOAK_ISSUER=http://localhost:8080/realms/tcg-card-stack`, `KEYCLOAK_JWKS_URL` derived from it if unset.
- Middleware: `Authorization: Bearer <jwt>` → `jose.jwtVerify` against remote JWKSet (cached), issuer + `RS256` enforced → parse `realm_access.roles`; 403 if `collector` missing; 401 on any verification failure.
- Attach `sub` to context for ownership checks.
- Error responses are RFC 9457 problems (`401 unauthorized`, `403 forbidden`).

## 7. Error handling (RFC 9457)

`application/problem+json` with `type` (slug URI e.g. `https://tcg-card-stack.local/problems/validation-error`), `title`, `status`, `detail`, `instance` (request path). Mapping: zod → 400 (`errors[]` with path/message); 404; 401/403; 409; 412; 500 (unhandled, logged, no internals leaked). Hono `app.onError` + `notFound` handler.

## 8. Database changes

`init.sql`:
- `binders`: add `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`
- `cards`: add `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`, `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`
- `grading_certificates`: add `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`, `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`

Drizzle schema updated to match (`.defaultNow()`, `$onUpdate(() => new Date())` on `updatedAt`).
Apply with `docker compose down -v && docker compose up -d --wait` (recreates + reseeds; approved).

## 9. Tests (Vitest, no live DB)

- `list.test.ts`: page/pageSize/sort/filter parsing incl. invalid inputs, `in` splitting, envelope math
- `etag.test.ts`: ETag build/match, comma-separated `If-None-Match`, `If-Match` extraction
- `problem.test.ts`: zod error → 400 problem body shape
- `schemas.test.ts`: body validation (grade bounds/step, dates, lengths)
- `auth.test.ts`: role middleware — 401 without token, 403 without role, `sub` propagation (mock jose / stub JWKS with generated key pair)
- `routes.test.ts`: route behavior with stubbed repository functions (401/403, 404, 412, 201 + Location, 304 on matching ETag)
- Spec gap to note in README: no automated test hits real Postgres; use Bruno for end-to-end verification

## 10. Bruno collection (`bruno/`)

- `bruno.json` (collection), `environments/local.bru` (`baseUrl: http://localhost:3000`)
- `Auth/Get Token`: POST `http://localhost:8080/realms/tcg-card-stack/protocol/openid-connect/token`
  form body `grant_type=password&client_id=tcg-backend&username=collector&password=collector`;
  post-response script stores `access_token` into environment; API requests use `Authorization: Bearer {{access_token}}`
- Requests: health; binders CRUD + conditional GET (If-None-Match demo); cards CRUD + PUT with If-Match (stale vs current); grading certificate POST; 401/403 cases
- README section: how to run (import `bruno/`, select `local` env, run Get Token first)

## 11. Makefile

`install`, `env` (cp .env.example .env), `up` / `down` / `recreate-db` (down -v + up -d --wait),
`dev` (`tsx --env-file=.env --watch src/index.ts`), `build`, `start`, `test` (vitest run),
`typecheck`, `lint`, `format`, `db:studio`.

## 12. Docs & config updates

- README: current status, setup (incl. `docker compose` recreate for schema change), run/dev, HTTP/2 note (`curl --http2-prior-knowledge http://localhost:3000/health`), auth flow + how to get a token, ETag/If-Match semantics, query syntax examples, Bruno usage, testing notes (no live-DB tests), ports (3000 API, 5432 PG, 8080 Keycloak)
- `.env.example`: add `PORT=3000`, `KEYCLOAK_ISSUER=http://localhost:8080/realms/tcg-card-stack`, `KEYCLOAK_JWKS_URL=…`; update `.env` likewise (gitignored)
- `.oxlintrc.json` / `.oxfmtrc.json`: keep as-is unless they conflict
- tsconfig: no changes expected; `src/index.ts` included in build

## 13. Execution order

**"Commit early, commit often"** — commit after *every working increment*, not just these milestones. Each item below is one or more small commits; nothing gets implemented in one big drop. If a step breaks the build, revert or fix before moving on — do not accumulate uncommitted work.

1. `chore: add created_at/updated_at (schema + init.sql)` → recreate DB, verify Drizzle parity
2. `feat: env validation, h2c server entrypoint, /health`
3. `feat: keycloak auth middleware + RFC 9457 error handling + etag/list helpers`
4. `feat: binders routes (GET list/detail, POST, PUT with If-Match)`
5. `feat: cards routes (GET list/detail, POST, PUT)`
6. `feat: grading certificate endpoint`
7. `test: vitest unit/stubbed-route tests`
8. `docs: bruno collection, Makefile, README, .env.example`
- Final: `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build` green; manual Bruno smoke; final commit

## 14. Risks / notes

- Recreating the DB destroys seed data changes made since last reset (approved; it re-seeds from init.sql)
- Bruno cannot easily do HTTP/2 h2c; requests will use HTTP/1.1 against the same port (server supports both) — fine for verification
- h2c requires clients to opt into the upgrade; plain `curl --http1.1` works via `allowHTTP1`
