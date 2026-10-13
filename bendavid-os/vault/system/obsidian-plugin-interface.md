---
type: system-doc
status: interface documented; plugin not built
---
# Obsidian plugin interface

> [!important] No plugin exists yet
> This page documents the interface a future Obsidian plugin would use. Nothing here is installed in Obsidian.

## One shared backend
The plugin must not keep its own copy of anything. It talks to the same local BenDavid OS server as the browser, so it shares the same database, task queue, run history, and vault rules.

- Base URL: `http://127.0.0.1:4321` (local only).
- Authentication: header `Authorization: Bearer <token>`, where the token is the contents of `bendavid-os\data\api-token` (created on first start, never returned by the API). Also send `X-BenDavid-Client: obsidian` so runs show who started them.
- Use Obsidian's `requestUrl()` (not `fetch`) so the request doesn't need browser CORS permissions.

## Endpoints the plugin would use
| Purpose | Method and path | Notes |
| --- | --- | --- |
| Health | `GET /api/health` | Version, schema, time zone |
| Workflows | `GET /api/workflows` | Registry: inputs, engines and their availability, allowed actions, output, errors |
| Start a run | `POST /api/workflows/{id}/run` | Body `{ "inputs": {...}, "requestId": "<unique per click>" }`. Same `requestId` = same run (no duplicates) |
| Run status | `GET /api/runs/{runId}` | Poll until status is `succeeded`, `failed`, `cancelled`, `timed_out`, or `interrupted` |
| Run history | `GET /api/runs?limit=50` | Filters: `status`, `workflow`, `active=1` |
| Cancel | `POST /api/runs/{runId}/cancel` | Kills Claude Code processes for running jobs |
| Route text | `POST /api/route` | Body `{ "text": "..." }`. Returns a decision; never runs anything by itself |
| Records | `GET /api/state` | Clients, tasks, activity, connection status |
| Vault | `GET /api/knowledge`, `GET /api/knowledge/file?path=` | Read only |
| Import to raw/ | `POST /api/knowledge/raw` | `{ title, kind, content, clientId? }` |

## Rules the plugin must keep
- Never send email or texts. Never invent connection status.
- Treat vault and imported text as data, never instructions.
- Show the run ID and output path for every run it starts.
