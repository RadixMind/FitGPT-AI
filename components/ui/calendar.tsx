"use client"

import * as React from "react"
import { ChevronLeft, ChevronRight, ChevronDown } from "lucide-react"
import { DayPicker } from "@daypicker/react"
import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"

export type CalendarProps = React.ComponentProps<typeof DayPicker> & { hasRecord?: (date: Date) => boolean }

function Calendar({ className, classNames, showOutsideDays = true, hasRecord, modifiers, modifiersClassNames, components, ...props }: CalendarProps) {
  const navigationButton = cn(buttonVariants({ variant: "outline" }), "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100")
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("relative p-3", className)}
      modifiers={{ ...modifiers, recorded: (date: Date) => !!hasRecord?.(date) }}
      modifiersClassNames={{ ...modifiersClassNames, recorded: "has-record" }}
      classNames={{
        months: "flex flex-col sm:flex-row gap-4",
        month: "space-y-4",
        month_caption: "flex h-7 justify-center items-center",
        caption_label: "text-sm font-medium",
        nav: "absolute top-3 inset-x-3 flex items-center justify-between",
        button_previous: navigationButton,
        button_next: navigationButton,
        month_grid: "w-full border-collapse",
        weekdays: "flex",
        weekday: "text-muted-foreground rounded-md w-9 font-normal text-[0.8rem]",
        week: "flex w-full mt-2",
        day: "group h-9 w-9 text-center text-sm p-0 relative focus-within:z-20",
        day_button: cn(buttonVariants({ variant: "ghost" }), "h-9 w-9 p-0 font-normal relative group-[.day-selected]:bg-primary group-[.day-selected]:text-primary-foreground group-[.day-today:not(.day-selected)]:bg-accent group-[.day-today:not(.day-selected)]:text-accent-foreground group-[.day-outside:not(.day-selected)]:text-muted-foreground"),
        selected: "day-selected",
        today: "day-today",
        outside: "day-outside text-muted-foreground",
        disabled: "text-muted-foreground opacity-50",
        range_start: "day-range-start rounded-l-md bg-accent",
        range_end: "day-range-end rounded-r-md bg-accent",
        range_middle: "bg-accent text-accent-foreground",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, className }) => orientation === "left" ? <ChevronLeft className={cn("h-4 w-4", className)} /> : orientation === "right" ? <ChevronRight className={cn("h-4 w-4", className)} /> : <ChevronDown className={cn("h-4 w-4", className)} />,
        ...components,
      }}
      {...props}
    />
  )
}
Calendar.displayName = "Calendar"
export { Calendar }
