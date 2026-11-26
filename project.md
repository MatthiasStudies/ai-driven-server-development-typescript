# Project Specification: tcg-card-stack Backend Application

A TypeScript backend application with Keycloak authentication and a PostgreSQL database for managing a Trading Card Game (TCG) collection.

Try to build on the existing basic project setup. Suggest edits to existing files / configs if required.

## Application Server
- **TypeScript:** "State-of-the-Art" (modern TypeScript features).
- **REST API via Hono (including HTTP/2 support):**
  - **GET Requests:** Support path and query parameters; conditional GET requests using the `If-None-Match` header.
  - **POST Requests:** Payload validation via Zod; return the `Location` header in the response.
  - **PUT / PATCH Requests:** Payload validation via Zod; prevent lost updates using optimistic concurrency control (`If-Match` header).
  - **Error Handling:** Standardized error responses using Problem Details (RFC 9457).
- **Database Access via Drizzle ORM:**
  - Support pagination.
  - Implement `1:1` and `1:N` relationships.
  - Use generated primary keys.
  - Prevent lost updates (e.g., via version columns/optimistic locking).
  - Automatic timestamps for `INSERT` (`createdAt`) and `UPDATE` (`updatedAt`).
- **Security & Testing:**
  - Authentication/Authorization via Keycloak: At least 1 user with 1 role protecting at least 1 secured endpoint/method.
  - Unit and integration tests written with Vitest.

## Acceptance Criteria & Tooling
- **API Verification:** Request collection for Bruno, Postman, or Thunder Client, **or** automated integration tests using Vitest and Axios over HTTP/2.
- **Database Inspection:** Schema and data visualization via a DB browser or Drizzle Studio.
- **Code Quality:** Linting with `oxlint` and formatting with `oxfmt`.

## TypeScript Coding Standards
- Use **named exports** (avoid default exports).
- Use `const` and `let` (no `var`).
- Use **template strings** for string interpolation.
- Use **object shorthand properties**.
- Use **destructuring** for objects and arrays.
- Adhere strictly to the configured linter (`oxlint`) and formatter (`oxfmt`) rules.

# tcg-card-stack
A TCG card collection management server.

- TypeScript backend
- Datamodell can be found in `postgres-data/init.sql`.
- It should be possible to create a new `Card`, a new `Binder` and add a grading certificate to an existing card
- Cards and binders must be accessible via a GET request and maybe edited using PUT
- Every API request must be validated with Zod
- A running postgres DB can be found at `localhost:5432` with the following credentials:
  - user: `tcg_user`
  - password: `tcg_password`
  - database: `tcg_tracker`
- A keycloak instance is also running
- When retrieving cards/binders, filter/ordering operators may be added
- Commit early, commit often
- Add a bruno collection for easy testing/demonstration
- Add a Makefile for common macros


# Agent Rules:
- Ask for uncertainties during planning phase
- Prefer to ask instead of assuming
- Before changing the database schema, always ask if the changes are ok
- Please clarify any missing details regarding the domain, data modell or other details by asking me!
