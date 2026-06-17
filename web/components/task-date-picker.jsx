"use client";

import { useEffect, useRef, useState } from "react";
import { addDays, format } from "date-fns";
import { CalendarDays, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { parseLocalDateValue, toDateValue } from "@/lib/task-recurrence";

const presets = [
  { label: "Today", value: 0 },
  { label: "Yesterday", value: -1 },
  { label: "Tomorrow", value: 1 },
  { label: "In 3 days", value: 3 },
  { label: "In a week", value: 7 },
  { label: "In 2 weeks", value: 14 },
];

function formatDateLabel(value) {
  const date = parseLocalDateValue(value);
  if (!date) return "No date";
  return format(date, "MMM dd, yyyy");
}

export default function TaskDatePicker({ value, onChange, disabled = false, label = "Due date" }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const selected = parseLocalDateValue(value) ?? undefined;

  useEffect(() => {
    if (!open) return undefined;
    function onPointerDown(event) {
      if (!rootRef.current?.contains(event.target)) {
        setOpen(false);
      }
    }
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function chooseDate(date) {
    if (!date) return;
    onChange?.(toDateValue(date));
    setOpen(false);
  }

  return (
    <div className="task-date-picker" ref={rootRef}>
      <button
        type="button"
        className="task-date-trigger"
        onClick={() => setOpen((value) => !value)}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={label}
      >
        <CalendarDays size={17} aria-hidden="true" />
        <span>{formatDateLabel(value)}</span>
        <ChevronDown size={15} aria-hidden="true" />
      </button>

      {open ? (
        <div className="task-date-popover" role="dialog" aria-label={`${label} calendar`}>
          <Card className="task-date-card">
            <CardContent className="task-date-card-content">
              <Calendar
                mode="single"
                selected={selected}
                defaultMonth={selected ?? new Date()}
                onSelect={chooseDate}
                className="task-date-calendar"
              />
            </CardContent>
            <CardFooter className="task-date-presets">
              {presets.map((preset) => (
                <Button
                  key={preset.label}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => chooseDate(addDays(new Date(), preset.value))}
                >
                  {preset.label}
                </Button>
              ))}
              <Button type="button" variant="ghost" size="sm" onClick={() => onChange?.("")}>
                Clear
              </Button>
            </CardFooter>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
