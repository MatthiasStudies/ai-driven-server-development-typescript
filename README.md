# TCG Card Stack backend

Project setup for a TypeScript/Node.js backend using PostgreSQL, Drizzle ORM and Keycloak. No HTTP server or authentication implementation has been added yet.

## Requirements

- Node.js 24 or newer and pnpm (the pinned version is in `package.json`).
- Docker and Docker Compose for the local services.

## Setup

```sh
pnpm install
cp .env.example .env
docker compose up -d
```

The example `DATABASE_URL` connects to the local `tcg_tracker` database. Adjust it if your PostgreSQL host or credentials differ. The values in Compose and the realm export are **development-only** credentials and settings, not production configuration.

Drizzle Kit loads `.env` when it is present. The database client reads `DATABASE_URL` from the process environment; it does not automatically load `.env`. For a future Node entrypoint, use Node's `--env-file=.env` option or supply the variable through the environment. For example, to use a TypeScript script locally: `pnpm exec tsx --env-file=.env path/to/script.ts`.

## Commands

- `pnpm typecheck` — check TypeScript, including the Drizzle config.
- `pnpm build` — compile `src` into `dist`.
- `pnpm lint` / `pnpm lint:fix` — check / fix lint issues.
- `pnpm format:check` / `pnpm format` — check / format project files.
- `pnpm db:studio` — open Drizzle Studio using `DATABASE_URL`.

There is no `start` command until a backend entrypoint is implemented.

## Database and identity

`postgres-data/init.sql` is the source of truth for a fresh application database, including seed data. `src/db/schema` mirrors its tables, constraints and relationships; `src/db/client.ts` exports the Drizzle client and PostgreSQL pool. When changing the schema, update both the SQL and Drizzle definitions and plan how to update existing databases. The `version` columns are only counters: implementing optimistic locking is the application's responsibility.

A binder's required `owner_user_id` stores its owner's Keycloak subject. The three seed binders belong to the fixed `collector` ID in `keycloak/realm-export.json`. Keycloak uses a separate database, so PostgreSQL cannot enforce this association as a foreign key. Future application code must validate the authenticated subject and enforce ownership; merely storing the subject does not implement authorization.

Compose starts Keycloak at `http://localhost:8080`, with realm `tcg-card-stack`, public client `tcg-backend`, and realm role `collector`. The client retains the original public login and redirect settings; no backend token validation or confidential client is configured. The realm export's collector user and Compose's administrator account are for local development only.

### Existing databases and migrations

The PostgreSQL initialization script runs **only when the data directory is first initialized**. Similarly, Keycloak's startup import skips a realm that already exists. Recreating containers does not apply either file to persisted databases. Existing application databases may lack `owner_user_id`, and an existing realm may still have the old `tcg-frontend` client. Update those databases separately, or explicitly choose to recreate the data after backing it up. Do not remove Docker volumes unless their data can be discarded.

No Drizzle migration baseline has been established, and no migrations are applied automatically. Generating an initial migration would create the existing tables again; do not run it against a database already initialized by `init.sql`. Before adopting Drizzle migrations for existing databases, establish and document an appropriate baseline and migration workflow.
