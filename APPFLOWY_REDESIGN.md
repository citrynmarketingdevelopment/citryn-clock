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

## Phases NOT yet done (future sessions)
- **Phase 3:** per-project team-management UI (`components/project-members.jsx`) wired to existing `GET/POST /api/projects/[projectId]/members`; optional additive `DELETE` member route.
- **Phase 4:** AppFlowy-style project-create modal (frontend only, same `POST /api/projects`).
- **Phase 5 audit:** sweep `globals.css` (~2,839 lines) for hardcoded hex values bypassing tokens; verify every route under the dark theme.
- **Optional schema change (needs approval):** `Task.position` for persistent within-column ordering.

## Files touched on this branch
| File | Type |
|---|---|
| `web/app/api/tasks/[taskId]/move/route.js` | new (additive API) |
| `web/app/projects/[projectId]/page.jsx` | edit (DnD board + AppFlowy cards) |
| `web/app/globals.css` | edit (dark AppFlowy tokens + board styles) |
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
