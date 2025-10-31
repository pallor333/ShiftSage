# API Plan (`/api/v1`)

> Goal: Mirror all application routes with JSON responses to serve the React frontend.

## Conventions
- **Auth:** Bearer token or session cookie (TBD).
- **Errors:** JSON: `{ "error": "message", "code": "..." }`
- **Pagination:** `?page=&limit=`
- **Versioning:** `/api/v1` prefix

## Example Endpoints
- `GET /api/v1/health` → `{ status: "ok" }`
- `GET /api/v1/shifts` → list shifts
- `POST /api/v1/shifts` → create
- `GET /api/v1/shifts/:id` → detail
- `PATCH /api/v1/shifts/:id` → update
- `DELETE /api/v1/shifts/:id` → delete
