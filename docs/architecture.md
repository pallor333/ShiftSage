# Architecture Overview

## Current
- **Server:** Node.js + Express; EJS-rendered views.
- **Views:** EJS templates, server-rendered.
- **Auth:** TBD (document current approach).
- **Data Layer:** TBD (ORM/queries).

## Target
- **Routes:** RESTful, versioned under `/api/v1` for JSON delivery.
- **Frontend:** React app (Vite), consumes API.
- **Testing:** Playwright VRT + unit/integration tests.
- **CI:** GitHub Actions for lint/test/build.
- **Docs:** OpenAPI (Swagger) for API definitions.

## Decisions
- Keep SSR minimal while migrating to SPA.
- Use centralized error handling + logging middleware.
- Prefer environment-driven config.
