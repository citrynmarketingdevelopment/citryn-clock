// Pure helpers shared by the task card, calendar, and list views.

export const priorities = ["LOW", "MEDIUM", "HIGH", "URGENT"];

export function initials(name) {
  return (name || "?")
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function isTaskCompleted(task) {
  return Boolean(task?.completedAt);
}

export function formatDueDate(value) {
  if (!value) return null;
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// --- Calendar date helpers ---

export function startOfMonth(date) {
  const d = new Date(date);
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function addMonths(date, delta) {
  const d = new Date(date);
  return new Date(d.getFullYear(), d.getMonth() + delta, 1);
}

export function monthLabel(date) {
  return new Date(date).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

export function dateKey(value) {
  const d = new Date(value);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function isSameDay(a, b) {
  return dateKey(a) === dateKey(b);
}

// 42-cell (6-week) grid starting on the Sunday on/before the 1st of the month.
export function buildMonthGrid(month) {
  const first = startOfMonth(month);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    return day;
  });
}

// --- List grouping (AppFlowy todo buckets) ---

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Groups tasks into Overdue / Today / This week / Upcoming / No date / Completed,
// preserving that order and dropping empty groups.
export function groupTasksByDue(tasks) {
  const today = startOfDay(new Date());
  const endOfWeek = new Date(today);
  endOfWeek.setDate(today.getDate() + (7 - today.getDay()));

  const buckets = {
    overdue: { key: "overdue", label: "Overdue", tasks: [] },
    today: { key: "today", label: "Today", tasks: [] },
    week: { key: "week", label: "This week", tasks: [] },
    upcoming: { key: "upcoming", label: "Upcoming", tasks: [] },
    none: { key: "none", label: "No due date", tasks: [] },
    completed: { key: "completed", label: "Completed", tasks: [] },
  };

  for (const task of tasks) {
    if (isTaskCompleted(task)) {
      buckets.completed.tasks.push(task);
      continue;
    }
    if (!task.dueDate) {
      buckets.none.tasks.push(task);
      continue;
    }
    const due = startOfDay(task.dueDate);
    if (due < today) buckets.overdue.tasks.push(task);
    else if (due.getTime() === today.getTime()) buckets.today.tasks.push(task);
    else if (due <= endOfWeek) buckets.week.tasks.push(task);
    else buckets.upcoming.tasks.push(task);
  }

  return [buckets.overdue, buckets.today, buckets.week, buckets.upcoming, buckets.none, buckets.completed].filter(
    (group) => group.tasks.length > 0,
  );
}
