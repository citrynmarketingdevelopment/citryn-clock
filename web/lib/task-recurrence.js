export const recurrenceFrequencies = ["NONE", "WEEKLY", "MONTHLY"];

export const weekdayOptions = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
];

export function parseLocalDateValue(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const text = String(value);
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function toDateValue(value) {
  const date = parseLocalDateValue(value);
  if (!date) return "";
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function startOfLocalDay(value) {
  const date = parseLocalDateValue(value) ?? new Date();
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function maxDate(a, b) {
  const first = parseLocalDateValue(a);
  const second = parseLocalDateValue(b);
  if (!first) return second ?? new Date();
  if (!second) return first;
  return first.getTime() > second.getTime() ? first : second;
}

function lastDayOfMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function monthlyCandidate(year, monthIndex, dayOfMonth) {
  const day = Math.min(Math.max(Number(dayOfMonth) || 1, 1), lastDayOfMonth(year, monthIndex));
  return new Date(year, monthIndex, day);
}

export function recurrenceDefaultsForDate(frequency, dueDateValue) {
  const base = parseLocalDateValue(dueDateValue) ?? new Date();
  if (frequency === "WEEKLY") {
    return {
      recurrenceFrequency: "WEEKLY",
      recurrenceInterval: 1,
      recurrenceDayOfWeek: base.getDay(),
      recurrenceDayOfMonth: null,
    };
  }
  if (frequency === "MONTHLY") {
    return {
      recurrenceFrequency: "MONTHLY",
      recurrenceInterval: 1,
      recurrenceDayOfWeek: null,
      recurrenceDayOfMonth: base.getDate(),
    };
  }
  return {
    recurrenceFrequency: "NONE",
    recurrenceInterval: 1,
    recurrenceDayOfWeek: null,
    recurrenceDayOfMonth: null,
  };
}

export function recurrenceLabel(task) {
  const frequency = task?.recurrenceFrequency ?? "NONE";
  if (frequency === "WEEKLY") {
    const day = weekdayOptions.find((item) => item.value === Number(task?.recurrenceDayOfWeek));
    return `Repeats ${day ? day.label : "weekly"}`;
  }
  if (frequency === "MONTHLY") {
    return `Repeats monthly${task?.recurrenceDayOfMonth ? ` on day ${task.recurrenceDayOfMonth}` : ""}`;
  }
  return "";
}

export function nextRecurringDueDate(task, completedAt = new Date()) {
  const frequency = task?.recurrenceFrequency ?? "NONE";
  if (frequency === "NONE") return null;

  const interval = Math.max(Number(task?.recurrenceInterval) || 1, 1);
  const base = startOfLocalDay(maxDate(task?.dueDate, completedAt));

  if (frequency === "WEEKLY") {
    const fallback = parseLocalDateValue(task?.dueDate) ?? parseLocalDateValue(completedAt) ?? new Date();
    const targetDay =
      task?.recurrenceDayOfWeek === null || task?.recurrenceDayOfWeek === undefined
        ? fallback.getDay()
        : Math.min(Math.max(Number(task.recurrenceDayOfWeek), 0), 6);
    const next = new Date(base);
    let daysUntilTarget = (targetDay - next.getDay() + 7) % 7;
    if (daysUntilTarget === 0) daysUntilTarget = interval * 7;
    else daysUntilTarget += (interval - 1) * 7;
    next.setDate(next.getDate() + daysUntilTarget);
    return next;
  }

  if (frequency === "MONTHLY") {
    const fallback = parseLocalDateValue(task?.dueDate) ?? parseLocalDateValue(completedAt) ?? new Date();
    const targetDay = task?.recurrenceDayOfMonth || fallback.getDate();
    let candidate = monthlyCandidate(base.getFullYear(), base.getMonth(), targetDay);
    if (candidate.getTime() <= base.getTime()) {
      candidate = monthlyCandidate(base.getFullYear(), base.getMonth() + interval, targetDay);
    }
    return candidate;
  }

  return null;
}
