---
type: system-doc
---
# Request routing

Every request (typed, clicked, spoken, or from a future Obsidian plugin) goes through the same backend and lands on one of three routes.

| Route | What it does | Needs | Example |
| --- | --- | --- | --- |
| **Saved data & deterministic** | Rules over the database: priorities, records, missing statements, templates, existing reports. No AI call. | Nothing | Plan My Day, Find Missing Statements, template follow-ups |
| **Lightweight reasoning** | One structured call to the model you configure (classification, short summaries, drafts). | AI service verified on Connections | Summarize Client (AI), Prepare Follow-Up (AI) |
| **Workflow execution** | Longer tasks run by the installed Claude Code in headless mode with read-only tools. | Claude Code verified on Connections | Review Pipeline (Claude Code) |

## How the router decides
- The current router is **rule-based** (`server/router.js`). It matches known phrases such as "plan my day", "missing statements", "follow up Derek", "summarize Maria", "review pipeline".
- It never executes anything. It returns a *decision*: run a workflow, ask a clarifying question, open a page, or search.
- Decisions that would use the AI service or Claude Code always ask for confirmation first.
- Ambiguous requests ("summarize missing statements") and unsupported ones ("make me a sandwich") get a clarifying question with options. Nothing is guessed.
- No confidence scores are shown, because the rule-based router doesn't compute any.

## Replacing the router
A model-based router can be added later as another implementation with the same `route(text, context)` interface (`BENDAVID_ROUTER` setting). Its decisions go through the same validation (`validateDecision`), so it still cannot run anything outside the workflow registry. No particular model is required; any model must first pass the Connections self-test.
