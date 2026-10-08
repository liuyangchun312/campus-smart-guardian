# Workbench Phase One Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development to implement and review these tasks. Track progress with checkboxes below.

**Goal:** Deliver the five approved first-phase improvements: actionable home, grouped navigation, direct record links, accurate deployment copy, and consistent lists/forms.

**Architecture:** Keep React, hash navigation, existing account persistence, and all current business states. Put record selection in the hash and retain each page's filter state in WorkspaceApp. Reuse existing pending-task calculations. Detect persistence environment from the backend rather than the browser hostname.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, Node.js, Cloudflare Workers.

**Spec:** The first phase approved in this conversation on 2026-10-08. Later phases (dispatch roles, attachments, notifications, knowledge expansion, database redesign) are separate work.

## Global Constraints

- Preserve existing changes in server/app.mjs and server/app.test.mjs.
- Do not deploy, push, reset data, or introduce fictional business records.
- Keep personal consultation private and existing authorization intact.
- Keep Chinese product copy, light/dark themes, large type, keyboard access, and mobile support.
- Use existing Lucide icons and a restrained, dense workbench layout.

## Tasks And Interfaces

- [x] Task 1: Root implements tested route parsing/formatting in src/lib/navigation.ts, integrates controlled selection/filter state in src/App.tsx, groups sidebar navigation, and keeps legacy hashes working.
  - WorkspaceRoute: { page: Page; recordId?: string; filter?: string }.
  - Record navigation: openRecord(type: "order" | "inspection", id: string): void.
  - Page navigation: navigate(page: Page, options?: { recordId?: string; filter?: string }): void.
  - OrdersViewState: { search: string; filter: "all" | "open" | OrderStatus; priority: "all" | "urgent" | WorkOrder["priority"]; layout: "list" | "cards" }.
  - InspectionViewState: { search: string; filter: "all" | "open" | "overdue" | "review" | "high" | "closed" }.
  - Tests must catch lost IDs, invalid filters, malformed encoding, and unauthorized admin links.
- [x] Task 2: Home/operations worker replaces Home.tsx with counts, priority queue, recent records, and concise tools; adds id to PendingTask and uses openRecord in Home/Operations. Owns Home.tsx, workbench.css, Operations.tsx, operations.ts and relevant tests.
  - Home keeps navigate/ask/openTool/orders/inspections and adds openRecord.
  - Operations adds openRecord, period: RecordPeriod, onPeriodChange(period): void.
  - Verify pending ordering, completed-record exclusion, and record IDs with focused Vitest tests.
- [x] Task 3: Orders/repair worker adds compact desktop table and mobile cards, priority/status/search filters, controlled detail selection, and consistent repair form spacing. Owns Orders.tsx, Repair.tsx, orders.css.
  - Orders adds selectedId: string | null, onSelect(id: string | null): void, view: OrdersViewState, onViewChange(view): void.
  - Keep copying, deleting, manual status changes, and all repair danger checks intact.
  - Browser verification must exercise filtering, opening/closing, status updates, both layouts, mobile, and empty states.
- [x] Task 4: Deployment/safety worker adds backend-reported deployment and a frontend DeploymentProvider/useDeployment context; updates Safety, Tools and login copy. Owns deployment.tsx, Safety.tsx, safety.css, Tools.tsx, SessionGate.tsx, api.ts, targeted server health fields/tests.
  - useDeployment returns { deployment: "local" | "cloud" | "unknown"; label: string; storageLabel: string; description: string }.
  - Safety adds selectedId/onSelect and view/onViewChange using InspectionViewState.
  - Verify both local and injected cloud database health responses. No credential or AI request behavior changes.
- [x] Task 5: Root integrates, runs npm test and npm run build, then browser-checks desktop/mobile, deep links, back/forward, filters, themes, and overflow. Request independent code review and fix confirmed issues.

## Execution Notes

- Ruling: Work in a new codex/workbench-phase-one branch in the existing checkout so the user's uncommitted server changes stay available. Do not create a second checkout or commit the user's changes.
- Ruling: Low-impact copy/CSS changes receive browser verification; meaningful navigation/priority/deployment behavior receives focused tests.
- Files shared between workers and root: navigation.ts contracts are produced by root; workers only import them. App.tsx integration belongs to root. Worker implementation files do not overlap.

## Verification

- 2026-10-08: npm test passed 76 frontend and 29 backend tests; npm run build passed.
- Independent review found and verified fixes for stale history filters, new orders hidden by filters, and a truncated full-queue destination. Scoped final review had no remaining findings.
- Browser checks passed registration, exact-record links, login redirects, missing records, saved changes, page/history filter preservation, fresh filter links, complete queues, and period retention.
- Screenshots and overflow checks cover 1440px desktop, 390px dark mobile, 320px light mobile, and large type. UI tests used an isolated database under ignored output/phase-one-data.
- Local frontend remains at http://127.0.0.1:5173; API was switched back to the project's original .guardian data after testing. No deployment or commits were made.
