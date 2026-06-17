"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import * as React from "react";
import { DayPicker } from "react-day-picker";
import { cn } from "@/lib/utils";

function Calendar({ className, classNames, showOutsideDays = true, components: userComponents, ...props }) {
  const defaultClassNames = {
    months: "ui-calendar-months",
    month: "ui-calendar-month",
    month_caption: "ui-calendar-month-caption",
    caption_label: "ui-calendar-caption-label",
    nav: "ui-calendar-nav",
    button_previous: "ui-calendar-nav-button ui-calendar-prev",
    button_next: "ui-calendar-nav-button ui-calendar-next",
    weekdays: "ui-calendar-weekdays",
    weekday: "ui-calendar-weekday",
    week: "ui-calendar-week",
    day: "ui-calendar-day",
    day_button: "ui-calendar-day-button",
    today: "ui-calendar-today",
    outside: "ui-calendar-outside",
    selected: "ui-calendar-selected",
    hidden: "ui-calendar-hidden",
    disabled: "ui-calendar-disabled",
    range_start: "ui-calendar-range-start",
    range_end: "ui-calendar-range-end",
    range_middle: "ui-calendar-range-middle",
    week_number: "ui-calendar-week-number",
  };

  const mergedClassNames = Object.keys(defaultClassNames).reduce(
    (acc, key) => ({
      ...acc,
      [key]: classNames?.[key] ? cn(defaultClassNames[key], classNames[key]) : defaultClassNames[key],
    }),
    {},
  );

  const defaultComponents = {
    Chevron: (props) => {
      if (props.orientation === "left") {
        return <ChevronLeft size={16} strokeWidth={2} {...props} aria-hidden="true" />;
      }
      return <ChevronRight size={16} strokeWidth={2} {...props} aria-hidden="true" />;
    },
  };

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("ui-calendar", className)}
      classNames={mergedClassNames}
      components={{ ...defaultComponents, ...userComponents }}
      {...props}
    />
  );
}
Calendar.displayName = "Calendar";

export { Calendar };
