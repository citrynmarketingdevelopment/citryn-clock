# Citryn Clock Project Map

Last updated: May 13, 2026

## 1. Product Goal
Build a full work management platform on top of the existing time clock system, with:
- Role-based dashboards for employees and admins
- Project boards with Kanban task management
- Personal task views (`My Tasks`) with due date visibility
- Existing timeclock/timesheet flows integrated as one tab in the new app shell

## 2. User Roles
### Employee
- Login and access dashboard
- Use sidebar tabs: `Projects`, `My Tasks`, `Timeclock`, `Due Date`
- View tasks assigned to them in `My Tasks`
- View task deadlines in calendar/date-focused view
- Create projects and tasks (same as admin unless changed later)

### Admin
- Same dashboard shell and tabs as employee
- Extra sidebar tab: `Timesheets`
- Can review employee clock-in/out and timesheet data
- Can create projects and tasks
- Can assign tasks to users

## 3. Navigation Structure
### Shared app shell
- Top area: page title, optional search, profile/actions
- Left sidebar:
- `Projects`
- `My Tasks`
- `Timeclock`
- `Due Date`
- Admin only:
- `Timesheets`

### Route map (web)
- `/dashboard` -> overview/home
- `/projects` -> project list
- `/projects/[projectId]` -> Kanban board
- `/my-tasks` -> assigned task list/board
- `/due-dates` -> calendar/date board for assigned tasks
- `/timeclock` -> existing timeclock UI
- `/timesheets` -> admin-only employee timesheet management

## 4. Core Feature Requirements
### Projects
- Users can create project boards
- Each board supports Kanban columns (initial default):
- `To Do`
- `In Progress`
- `Review`
- `Done`
- Tasks can be moved across columns (drag and drop)

### Tasks
- Users can create tasks inside project boards
- Required task fields:
- `title`
- `description`
- `laborTime` (estimated or planned labor time)
- `priority` (Low, Medium, High, Urgent)
- Additional fields:
- `assignees` (one or many users)
- `dueDate` (for date/calendar views)
- `status` (column/state)

### Assignment behavior
- When a task is assigned to a user, it must appear in that user's `My Tasks`
- Assigned tasks with due dates must appear in `Due Date` view
- Task updates in project board should reflect in assignee views in near real-time or on refresh

### Timeclock integration
- Keep current clock-in/out and timesheet logic intact
- Expose current functionality under `Timeclock` tab in new dashboard shell

### Timesheets (admin)
- Admin-only page to inspect employee time entries
- Filter by employee, date range, and status
- Export or summary support can be phase 2

## 5. UX Direction (from provided references)
### Dashboard style
- Dark theme, compact enterprise layout
- Asana-inspired sidebar and content cards
- Fast scanning with clear sections (`My Tasks`, `Projects`, summaries)

### Employee Due Date view
- Calendar-like weekly/monthly board
- Shows assigned tasks in date columns/cells
- Emphasis on upcoming and overdue work

### Main Project Board view
- Asana/GitHub-inspired Kanban
- Clear columns, compact task cards, easy drag/drop
- Task cards show title, assignee(s), priority, due date, and labor time indicator

## 6. Data Model Blueprint
### Existing/assumed
- `User`
- `Timesheet` / `TimeEntry`

### New entities
- `Project`
- `id`, `name`, `description`, `ownerId`, `createdAt`, `updatedAt`
- `BoardColumn`
- `id`, `projectId`, `name`, `order`
- `Task`
- `id`, `projectId`, `columnId`, `title`, `description`, `laborTime`, `priority`, `dueDate`, `createdById`, `createdAt`, `updatedAt`
- `TaskAssignment`
- `id`, `taskId`, `userId`, `assignedById`, `assignedAt`
- `TaskActivity` (optional phase 2)
- `id`, `taskId`, `userId`, `type`, `metadata`, `createdAt`

## 7. Permission Rules
- Employee:
- View/create projects (current requested behavior)
- Create/edit tasks in accessible projects
- View tasks assigned to them
- Access own timeclock data
- Admin:
- All employee capabilities
- Access admin `Timesheets` page
- View employee time data and summaries

## 8. Delivery Phases
### Phase 1: App shell + existing features
- Add unified login-to-dashboard flow
- Build role-based sidebar
- Embed existing `Timeclock` functionality as tab/page
- Add admin-only `Timesheets` nav guard

### Phase 2: Projects + Kanban
- Project list page
- Project board with columns and drag/drop
- Task create/edit with required fields
- Task assignment support

### Phase 3: Personal productivity views
- `My Tasks` view powered by assignments
- `Due Date` calendar/date board
- Overdue/upcoming grouping and filters

### Phase 4: Enhancements
- Notifications for new assignments/due dates
- Advanced filters, saved views
- Task comments/activity log
- Reporting/export for admins

## 9. Technical Notes (current stack fit)
- `web/` (Next.js + Prisma + Postgres) should host:
- Core APIs for projects/tasks/assignments
- Role checks and auth guards
- Web dashboard UI
- `mobile/` can consume assignment/timeclock APIs later for parity

## 10. Definition of Done (MVP)
- Employee can login, see sidebar, and open `Projects`, `My Tasks`, `Timeclock`, `Due Date`
- Admin sees same plus `Timesheets`
- User can create project board and create task with required fields
- User can assign task to another user
- Assigned user sees task in `My Tasks`
- Assigned task with due date appears in `Due Date`
- Existing timeclock still functions without regression


