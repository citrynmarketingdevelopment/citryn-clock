# AppFlowy Redesign — Reference

Branch: `features/appflowy-redesign`
Created: 2026-06-16
Purpose: Port AppFlowy's Kanban interaction model + visual look into Citryn Clock **without changing the Prisma schema or existing features** (timeclock, timesheets, Mojo's Kitchen, auth all untouched).

## Why this branch exists
Citryn Clock already has an AppFlowy-shaped data layer (Project, ProjectMember, ordered ProjectColumn, Task with columnId/priority/dueDate/laborMinutes, TaskAssignment, TaskAttachment) and most APIs. This work is ~85% frontend/UX: we adopt AppFlowy's *board interactions and aesthetic*, not its Flutter/Rust code. We do NOT port Notion docs, the block editor, AI, or the realtime sync engine.

## Decisions locked in (from planning chat)
1. **Kanban moves:** add a *minimal additive* API endpoint to persist column changes. No schema changes, no edits to existing routes.
2. **Visual scope:** full dark reskin to the AppFlowy/Asana aesthetic via global CSS tokens.
3. **Include AppFlowy frontend look** across the new board surfaces.

## Stack reminder
Next.js 16 (App Router), React 19, **JavaScript (no TS)**, plain CSS in `web/app/globals.css` (CSS-variable design tokens), Prisma 6 + Neon/Postgres, JWT auth via HTTP-only cookie. New runtime dep: `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`.

## Key constraint & known limitation
- `Task` has **no `position` field** (only `ProjectColumn.order` exists). So **cross-column drags persist** (the core AppFlowy behavior); **within-column manual reordering does NOT persist** across refresh and settles by `createdAt`. Adding `Task.position` would be a schema change — intentionally deferred.

## Implementation phases
### Phase 1 — additive move endpoint  ✅ implemented
- **New file:** `web/app/api/tasks/[taskId]/move/route.js`
- `POST { columnId }` → validates the column belongs to the task's project → `prisma.task.update({ data: { columnId } })` → returns the full task payload (same shape as `PATCH /api/tasks/[taskId]`).
- Reuses `requireRequestUser` + `canUserAccessProject`. Existing routes untouched.

### Phase 2 — Kanban drag-and-drop  ✅ implemented
- **File:** `web/app/projects/[projectId]/page.jsx`
- `@dnd-kit` `DndContext` over the lanes; cards draggable, lanes droppable.
- Optimistic local move → `POST .../move` → rollback on failure.
- Existing column dropdown in the create-task modal kept as fallback / a11y path.

### AppFlowy visual look  ✅ in progress
- Dark AppFlowy-inspired tokens rewritten in `:root` of `web/app/globals.css`.
- Board lanes/cards restyled to AppFlowy: column header with count + quick add, compact rounded cards, priority pills, assignee avatars, due-date chip.

### Phase 3 — per-project team-management UI  ✅ implemented
- **New file:** `web/components/project-members.jsx` — Members drawer: list members, add by email, change role (MEMBER/MANAGER), remove. Owner/manager only; others see read-only roles.
- **New (additive) route:** `DELETE /api/projects/[projectId]/members?userId=...` (same manage guard as `POST`; owner cannot be removed). Approved in the resume session.
- **Edit:** `web/app/projects/[projectId]/page.jsx` — the static header avatar row is now a "Members" trigger opening the drawer; board reloads on member changes.

### Phase 4 — AppFlowy-style project-create modal  ✅ implemented
- **Edit:** `web/app/projects/page.jsx` — inline form replaced with a centered create dialog (live initials badge preview, name, description). Same `POST /api/projects`.
- **Note:** no persisted icon/color picker — `POST /api/projects` only accepts `name`/`description` and a color/icon column would be a schema change (excluded). Badge is derived from the name, matching the card/list badge.

### Phase 5 — dark-theme audit  ✅ implemented
- Converted light-theme leftovers in `globals.css` to dark tokens: global `input/select`, `.ws-*` cards (due-dates), `.stat-card`, `.session-panel`, `.employee-dropdown`/summary (timesheets), `.chip` status pills (timeclock/users/timesheets), `.users-delete-modal`, the `.mk-review-*` kitchen review page, and the clock `.ring-track`.
- Added component styles for the members drawer and the project-create modal.
- Verified: eslint clean on changed files; `next build` succeeds (all routes compile, `DELETE` registered on the members route).

## AppFlowy full-app port — Wave 1  ✅ implemented
Staged delivery (see `~/.claude/plans/now-can-we-make-encapsulated-feigenbaum.md`). Wave 1 = AppFlowy look + interactions, no schema migration.

**Shared building blocks (new):**
- `web/lib/task-client.js` — fetch helpers (updateTask, setAssignees, attachments, column CRUD, project rename).
- `web/lib/task-format.js` — pure helpers (priority, due formatting, month-grid, list grouping).
- `web/components/task-card.jsx` — `TaskCardBody` (board) + `TaskChip` (calendar).
- `web/components/task-detail-dialog.jsx` — **centered AppFlowy row-detail popup** with inline editing (title, priority, due, labor, assignees, status/column) + attachments; replaces the old `taskview-*` drawer everywhere.
- `web/components/month-calendar.jsx` — AppFlowy month grid (Due Dates + My Tasks calendar + board calendar).
- `web/components/task-list-view.jsx` — AppFlowy todo list grouped Overdue/Today/This week/Upcoming/No date/Completed with inline checkboxes.
- `web/components/view-switcher.jsx` — Board/List/Calendar segmented control.
- `web/components/project-create-dialog.jsx` — shared AppFlowy create-project dialog (sidebar + landing).

**Backend (additive, no migration):**
- `PATCH /api/tasks/[taskId]` extended (title/description/priority/dueDate/laborMinutes/columnId).
- `assign` route allows empty `userIds` (clear assignees).
- New `POST/PATCH /api/projects/[projectId]/columns` (add + reorder, two-phase to respect `@@unique`) and `PATCH/DELETE /api/projects/[projectId]/columns/[columnId]` (rename/delete).
- `PATCH /api/projects/[projectId]` (rename project).

**Pages:** board gets Board/List/Calendar views + inline column editing (rename/add/reorder/delete) + the shared dialog; My Tasks gets List⇄Calendar; Due Dates becomes an interactive month calendar; `/projects` simplified to a sidebar-driven landing; sidebar shows an expandable Projects tree with "+ New project"; login restyled (no social auth); dashboard radii/borders aligned to AppFlowy.

**Verified:** eslint clean across all changed files; `next build` compiles all routes (new column routes registered).

## Wave 2 / Wave 3 (not yet done)
- **Wave 2:** custom properties (`ProjectField` + `TaskFieldValue` models + migration) and persistent ordering (`Project.order`, optional `Task.position`).
- **Wave 3:** AppFlowy-identical settings/workspace manager (My Account name/icon/password, Workspace name/icon/manage-users, Appearance) — excludes Cloud/Billing/AI/Sites/Plan/Shortcuts; needs `User.avatarUrl` migration.

## Phases NOT yet done (future sessions)
- **Visual verification pass:** the audit fixed readability (no more white-on-dark surfaces), but each route should still be eyeballed in a running dev server for polish (spacing, accent consistency).
- **Optional schema change (needs approval):** `Task.position` for persistent within-column ordering.

## Files touched on this branch
| File | Type |
|---|---|
| `web/app/api/tasks/[taskId]/move/route.js` | new (additive API) |
| `web/app/api/projects/[projectId]/members/route.js` | edit (additive `DELETE`) |
| `web/components/project-members.jsx` | new (members drawer) |
| `web/app/projects/[projectId]/page.jsx` | edit (DnD board + AppFlowy cards + members trigger) |
| `web/app/projects/page.jsx` | edit (project-create modal) |
| `web/app/globals.css` | edit (dark AppFlowy tokens + board/members/create styles + audit) |
| `web/package.json` / lock | add `@dnd-kit/*` |
| `APPFLOWY_REDESIGN.md` | this doc |

## Explicitly untouched
Prisma schema; all timeclock / timesheet / Mojo's Kitchen / auth routes & pages; `my-tasks` & `due-dates` data logic (reskin only via tokens).

## How to run
```bash
cd web
npm install
npx prisma generate
npm run dev   # http://localhost:3000
```
