"use client";

import { useMemo } from "react";
import { TaskChip } from "@/components/task-card";
import { addMonths, buildMonthGrid, dateKey, isSameDay, monthLabel, startOfMonth } from "@/lib/task-format";

const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MAX_CHIPS = 12;

// AppFlowy-style month calendar. Tasks are placed on their dueDate day cell.
export default function MonthCalendar({ tasks, month, onChangeMonth, onOpenTask, onCreateTaskForDay, onMoveTaskToDay }) {
  const monthDate = useMemo(() => startOfMonth(month ?? new Date()), [month]);
  const grid = useMemo(() => buildMonthGrid(monthDate), [monthDate]);

  const tasksByDay = useMemo(() => {
    const map = new Map();
    for (const task of tasks ?? []) {
      if (!task.dueDate) continue;
      const key = dateKey(task.dueDate);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(task);
    }
    return map;
  }, [tasks]);

  const today = new Date();
  const currentMonth = monthDate.getMonth();
  const noDateCount = (tasks ?? []).filter((task) => !task.dueDate).length;

  return (
    <div className="afcal">
      <header className="afcal-toolbar">
        <h2 className="afcal-month">{monthLabel(monthDate)}</h2>
        <div className="afcal-nav">
          <button type="button" className="afcal-nav-btn" onClick={() => onChangeMonth(addMonths(monthDate, -1))} aria-label="Previous month">
            {"<"}
          </button>
          <button type="button" className="afcal-today-btn" onClick={() => onChangeMonth(startOfMonth(new Date()))}>
            Today
          </button>
          <button type="button" className="afcal-nav-btn" onClick={() => onChangeMonth(addMonths(monthDate, 1))} aria-label="Next month">
            {">"}
          </button>
          <span className="afcal-nodate">No Date ({noDateCount})</span>
        </div>
      </header>

      <div className="afcal-weekdays">
        {weekdays.map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>

      <div className="afcal-grid">
        {grid.map((day) => {
          const key = dateKey(day);
          const dayTasks = tasksByDay.get(key) ?? [];
          const isToday = isSameDay(day, today);
          const outside = day.getMonth() !== currentMonth;
          const isWeekend = day.getDay() === 0 || day.getDay() === 6;
          return (
            <div
              key={key}
              className={`afcal-cell ${outside ? "outside" : ""} ${isWeekend ? "afcal-weekend" : ""}`}
              onDragOver={(event) => {
                if (!onMoveTaskToDay) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
              }}
              onDrop={(event) => {
                const taskId = event.dataTransfer.getData("text/task-id");
                if (!taskId || !onMoveTaskToDay) return;
                event.preventDefault();
                onMoveTaskToDay(taskId, day);
              }}
            >
              <div className="afcal-cell-head">
                {onCreateTaskForDay ? (
                  <button
                    type="button"
                    className="afcal-day-add"
                    aria-label={`Add task on ${key}`}
                    title="Add task"
                    onClick={() => onCreateTaskForDay(day)}
                  >
                    +
                  </button>
                ) : null}
                <span className={`afcal-daynum ${isToday ? "afcal-today" : ""}`}>{day.getDate()}</span>
              </div>
              <div className="afcal-cell-list">
                {dayTasks.slice(0, MAX_CHIPS).map((task) => (
                  <TaskChip key={task.id} task={task} onOpen={onOpenTask} draggable={Boolean(onMoveTaskToDay)} />
                ))}
                {dayTasks.length > MAX_CHIPS ? <span className="afcal-more">+{dayTasks.length - MAX_CHIPS} more</span> : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
