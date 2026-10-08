# School Order Workflow Implementation Plan

**Goal:** Users submit repairs to school administrators, who accept and process them; users confirm completion or request further work.

**Architecture:** Keep private workspaces for drafts and legacy personal records. Store explicitly submitted orders in a separate persistent school_orders table with owner IDs and server-controlled revisions. Merge canonical school records into the user's UI without allowing workspace writes to change the official record.

**Tech Stack:** React 19, TypeScript, Node.js SQLite, Cloudflare Durable Object SQLite, Vitest, Playwright.

**Spec:** User approved the proposed school-admin workflow on 2026-10-08. The existing admin represents school staff. Official states: submitted, accepted, processing, awaiting_confirmation, resolved. Admin records assignee and handling notes; user can confirm or reopen after school completion. Drafts and historical self-reported submissions are not silently submitted.

## Global Constraints

- Preserve existing accounts, AI configuration, consultation privacy, and historical records.
- Authenticate all reads/writes; enforce owner and admin roles on the server.
- Record actor, time and notes from authenticated actions; reject stale revisions and illegal transitions.
- Keep deployment compatible with both local SQLite and existing Durable Object SQL.
- Use Chinese interface copy, existing Lucide icons, accessible controls, mobile and theme support.

## Tasks

- [x] Backend: write failing integration tests; add canonical table and submit/list/action endpoints; verify ownership, roles, idempotent submission, conflicts, persistence and workspace-write isolation.
- [x] User workflow: add shared statuses/types and canonical order hook; replace manual status controls with submit/confirm/reopen actions; refresh progress and surface request failures.
- [x] School workflow: add admin repair queue, status/priority/search filters, detail/history, assignee and processing notes.
- [x] Integration: update overview/export/filter statuses and relevant product copy; preserve legacy records and draft-only deletion.
- [ ] Verify: full tests/build, real user/admin browser workflow with an isolated database, mobile/theme/layout and error checks. Publish the tested changes to the existing GitHub/Cloudflare targets.

## Verification Notes

- 2026-10-08: 87 frontend and 36 backend tests passed; TypeScript/Vite build and Wrangler dry-run passed.
- Real local user/admin browser sessions passed submission, assignment, processing, completion, unresolved feedback, repeat completion and final user confirmation. Seven authenticated history entries persisted after reload.
- Desktop, 390px dark mobile and 320px overflow checks passed. Browser checks used an isolated database under ignored output/school-workflow-data, without adding production business records.
- Official-only deep links, canonical JSON backup and legacy imports alongside official orders passed.
- Independent code review found no actionable issues.
