# TCG Card Stack backend

A TypeScript/Hono API for trading card binders, cards, and grading certificates, using PostgreSQL, Drizzle ORM and Keycloak. Implementation is in progress; the API examples below describe the agreed interface and have not all been verified end to end. See `PLAN.md` for the implementation plan.

## Local setup

Requirements: Node.js 24 or newer, the pnpm version pinned in `package.json`, Docker Compose, and optionally [Bruno](https://www.usebruno.com/) for HTTP requests.

```sh
make install
make env       # creates .env only if missing; never overwrites it
make up        # start PostgreSQL and Keycloak
make dev       # run API in watch mode
```

Wait for Keycloak to finish starting before requesting a token. Adjust `.env` for your environment; the local defaults include:

| Setting             | Default                                                       | Purpose                                 |
| ------------------- | ------------------------------------------------------------- | --------------------------------------- |
| `DATABASE_URL`      | `postgres://tcg_user:tcg_password@localhost:5432/tcg_tracker` | Application database                    |
| `PORT`              | `3000`                                                        | HTTP/1.1 API, including Bruno           |
| `HTTP2_PORT`        | `3001`                                                        | Cleartext HTTP/2 (h2c), prior knowledge |
| `KEYCLOAK_ISSUER`   | `http://localhost:8080/realms/tcg-card-stack`                 | Token issuer                            |
| `KEYCLOAK_AUDIENCE` | `tcg-api`                                                     | Required access-token audience          |
| `KEYCLOAK_JWKS_URL` | issuer + `/protocol/openid-connect/certs`                     | Token signing keys; optional override   |

PostgreSQL listens on `localhost:5432` and Keycloak on `localhost:8080`. Both API ports serve the same application. Use a client with h2c prior-knowledge support for port 3001, for example `curl --http2-prior-knowledge http://localhost:3001/health` (curl must be built with HTTP/2 support). Port 3001 is not an HTTP/1.1 fallback or an HTTP/1.1 upgrade endpoint.

**Development only:** the Compose credentials, seeded users, password grant, Keycloak development mode, and plain HTTP listeners are not secure production configuration. Tokens and passwords travel over unencrypted HTTP. Do not expose these services to untrusted networks or use these credentials in production.

### Existing volumes and realm imports

`postgres-data/init.sql` initializes the application schema, seed data and the separate Keycloak database **only on first initialization** of the PostgreSQL data directory. Keycloak's startup import similarly skips an existing realm. Restarting containers or running `make up` does not update either existing database. In particular, older application databases can lack the current timestamp or ownership columns, and older realms can lack the `tcg-backend` client or the `tcg-api` access-token audience mapper.

For an existing `tcg-card-stack` realm, add the audience mapper to client `tcg-backend` manually (OIDC audience mapper, custom audience `tcg-api`, add to access token), or recreate the volume after backing up anything needed. The mapper in `keycloak/realm-export.json` only applies on fresh import. An existing `.env` is not replaced by `make env`; ensure its `KEYCLOAK_AUDIENCE` and ports match your intended configuration. Obtain a new token after changing the mapper.

**Destructive reset:** `make recreate-db` asks you to type `RESET`, then runs `docker compose down -v` and `docker compose up -d --wait`. This deletes the Compose PostgreSQL volume, including **both application data and the Keycloak database** (users, realm changes and other identity data), and initializes them afresh. Back up first; do not run it if any of that data must be retained. `make down` stops/removes containers without deleting volumes.

There is no established Drizzle migration baseline or automatic migration. For an existing database, arrange appropriate schema changes separately; generating an initial migration against an already initialized database would attempt to recreate existing tables. Keep `init.sql` and `src/db/schema/` aligned when changing the schema.

## Authentication

The local realm is `tcg-card-stack`, with public client `tcg-backend`, realm role `collector`, and seeded user `collector` / `collector`. The API is designed to verify Keycloak bearer tokens (issuer, signature and `tcg-api` audience), require the `collector` realm role, and restrict binders to the token subject; cards and certificates are scoped through their binder. `/health` is public. Seed binders belong to the exported collector user's fixed subject.

For local demonstration only, request a token via Bruno's **Auth / Get Token**, or:

```sh
curl -sS -X POST 'http://localhost:8080/realms/tcg-card-stack/protocol/openid-connect/token' \
  -d 'grant_type=password' -d 'client_id=tcg-backend' \
  -d 'username=collector' -d 'password=collector'
```

Pass the returned `access_token` as `Authorization: Bearer <token>`. Tokens expire; request another when needed. A token without the required role should receive 403, while a missing, invalid, expired or wrong-audience token should receive 401.

## API and concurrency

Paths are at the root, without an `/api` prefix:

| Endpoint                                                                            | Intended operation                    |
| ----------------------------------------------------------------------------------- | ------------------------------------- |
| `GET /health`                                                                       | Public health check                   |
| `GET /binders`, `POST /binders`                                                     | List or create owned binders          |
| `GET /binders/:id`, `PUT /binders/:id`                                              | Fetch or replace an owned binder      |
| `GET /cards`, `POST /cards`                                                         | List or create cards in owned binders |
| `GET /cards/:id`, `PUT /cards/:id`                                                  | Fetch or replace an owned card        |
| `GET /cards/:cardId/grading-certificate`, `POST /cards/:cardId/grading-certificate` | Read or add its certificate           |

POSTs are intended to return `201` and a `Location` header. Only one certificate is permitted per card and certificate numbers are unique; conflicts return 409. Request validation and errors use Problem Details (`application/problem+json`).

GET responses support `ETag` and `If-None-Match` for conditional reads (304 when unchanged). PUT is a full replacement and requires the **current detail GET's** exact `ETag` in `If-Match`, including its quotes. Missing preconditions are rejected; a stale ETag should return 412. Rows have versions for optimistic locking. Fetch the detail again before another update, including after changes to related data; treat ETags as opaque rather than constructing them yourself.

Lists use `page` (default 1), `pageSize` (default 20, maximum 100), and `sort` (comma-separated fields; `-` means descending), returning a `data` array and `meta` pagination information. Filters use `filter.<field>.<operator>=<value>`; operators include `eq`, `ne`, `in` (comma-separated), `contains` (case-insensitive), `gte`, and `lte`. Supported fields and operators vary by resource and are validated. Examples (quote URLs in a shell):

```text
/binders?page=1&pageSize=20&sort=-createdAt&filter.name.contains=Binder
/cards?filter.rarity.in=Holo%20Rare,Ultra%20Rare&filter.acquiredAt.gte=2021-01-01
/cards?filter.name.eq=Charizard&filter.acquiredAt.lte=2024-12-31
```

## Bruno walkthrough

1. Open/import `bruno/` as a collection and select its `local` environment. The API base URL is HTTP/1.1 on port 3000; change it if `PORT` differs.
2. Run **Health** and **Auth / Get Token**. The token request's post-response script stores `access_token` in the selected environment. Re-run it when the token expires.
3. Use **Binders** and **Cards** to list, create and fetch resources. The environment starts with seeded `binderId=1` and `cardId=3`; creation requests capture IDs from `Location` when available. POST and PUT requests change persistent data.
4. Run the detail GET for the current ID before the conditional GET or PUT; it captures the current ETag. After changing an ID or related data, fetch again. A stale update sample demonstrates 412. Certificate POST needs an ungraded owned card and a unique certificate number; repeating it demonstrates 409.
5. **Errors** includes 400, 401, 404 and missing-precondition examples. To demonstrate 403, set `noRoleToken` to a valid token from this realm for a user without `collector`; no such user is seeded. Invalid or missing tokens demonstrate 401 instead.

Bruno may persist scripted environment updates to `bruno/environments/local.bru`, including access tokens. Do not commit tokens or other secrets; clear/reset local environment changes before committing. Run requests individually rather than blindly running the whole collection, since examples create and modify data and some intentionally fail.

## Commands and verification

- `make dev` / `make build` / `make start` — develop, compile, and run the compiled server (build before start).
- `make test` — run Vitest; tests use unit tests and/or stubbed dependencies, **not a live PostgreSQL database**. Bruno is intended for manual HTTP-level verification against running local services.
- `make typecheck`, `make lint`, `make format-check`, `make format` — quality checks and formatting.
- `make db-studio` — open Drizzle Studio using `.env` / `DATABASE_URL`.
- `make help` — list shortcuts. The equivalent pnpm scripts are in `package.json`.
