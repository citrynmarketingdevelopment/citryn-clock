"use client";

import { recurrenceDefaultsForDate, weekdayOptions } from "@/lib/task-recurrence";

export default function TaskRecurrenceControls({
  frequency = "NONE",
  interval = 1,
  dayOfWeek = null,
  dayOfMonth = null,
  dueDate = "",
  disabled = false,
  onChange,
}) {
  const currentFrequency = frequency ?? "NONE";
  const currentInterval = Math.max(Number(interval) || 1, 1);

  function updateFrequency(nextFrequency) {
    onChange?.(recurrenceDefaultsForDate(nextFrequency, dueDate));
  }

  function patch(values) {
    onChange?.({
      recurrenceFrequency: currentFrequency,
      recurrenceInterval: currentInterval,
      recurrenceDayOfWeek: currentFrequency === "WEEKLY" ? Number(dayOfWeek ?? 0) : null,
      recurrenceDayOfMonth: currentFrequency === "MONTHLY" ? Number(dayOfMonth ?? 1) : null,
      ...values,
    });
  }

  return (
    <div className="taskdialog-prop taskdialog-recurrence-row align-top">
      <span className="taskdialog-prop-label">Repeat</span>
      <div className="taskdialog-prop-value task-recurrence">
        <div className="task-recurrence-main">
          <select
            value={currentFrequency}
            disabled={disabled}
            onChange={(event) => updateFrequency(event.target.value)}
            aria-label="Repeat schedule"
          >
            <option value="NONE">Does not repeat</option>
            <option value="WEEKLY">Every week</option>
            <option value="MONTHLY">Every month</option>
          </select>

          {currentFrequency !== "NONE" ? (
            <select
              value={currentInterval}
              disabled={disabled}
              onChange={(event) => patch({ recurrenceInterval: Math.max(Number(event.target.value) || 1, 1) })}
              aria-label="Repeat interval"
            >
              <option value={1}>Every</option>
              <option value={2}>Every 2</option>
              <option value={3}>Every 3</option>
              <option value={4}>Every 4</option>
            </select>
          ) : null}

          {currentFrequency === "WEEKLY" ? (
            <select
              value={dayOfWeek ?? 0}
              disabled={disabled}
              onChange={(event) => patch({ recurrenceDayOfWeek: Number(event.target.value), recurrenceDayOfMonth: null })}
              aria-label="Repeat weekday"
            >
              {weekdayOptions.map((day) => (
                <option key={day.value} value={day.value}>
                  {day.label}
                </option>
              ))}
            </select>
          ) : null}

          {currentFrequency === "MONTHLY" ? (
            <select
              value={dayOfMonth ?? 1}
              disabled={disabled}
              onChange={(event) => patch({ recurrenceDayOfMonth: Number(event.target.value), recurrenceDayOfWeek: null })}
              aria-label="Repeat day of month"
            >
              {Array.from({ length: 31 }, (_, index) => index + 1).map((day) => (
                <option key={day} value={day}>
                  Day {day}
                </option>
              ))}
            </select>
          ) : null}
        </div>
        {currentFrequency !== "NONE" ? (
          <small>When completed, this task moves to the next scheduled date.</small>
        ) : null}
      </div>
    </div>
  );
}
