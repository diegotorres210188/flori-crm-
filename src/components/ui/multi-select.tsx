"use client";

import * as React from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface MultiSelectOption {
  value: string;
  label: string;
}

interface MultiSelectProps {
  options: MultiSelectOption[];
  value: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function MultiSelect({
  options,
  value,
  onChange,
  placeholder = "Seleccionar...",
  disabled = false,
  className,
}: MultiSelectProps) {
  const [open, setOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const [triggerWidth, setTriggerWidth] = React.useState<number>(0);

  React.useEffect(() => {
    if (!triggerRef.current) return;
    const obs = new ResizeObserver(([entry]) => {
      setTriggerWidth(entry.contentRect.width);
    });
    obs.observe(triggerRef.current);
    return () => obs.disconnect();
  }, []);

  const toggle = (optVal: string) => {
    onChange(
      value.includes(optVal)
        ? value.filter((v) => v !== optVal)
        : [...value, optVal]
    );
  };

  const remove = (optVal: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(value.filter((v) => v !== optVal));
  };

  const selectedLabels = options.filter((o) => value.includes(o.value));

  return (
    <Popover open={open} onOpenChange={disabled ? undefined : setOpen}>
      <PopoverTrigger
        ref={triggerRef}
        disabled={disabled}
        className={cn(
          "flex min-h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-xs ring-offset-background text-left",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
      >
        <div className="flex flex-wrap gap-1 flex-1 min-w-0">
          {selectedLabels.length === 0 ? (
            <span className="text-muted-foreground">{placeholder}</span>
          ) : (
            selectedLabels.map((o) => (
              <Badge
                key={o.value}
                variant="secondary"
                className="text-xs py-0 h-5 gap-1 pr-1"
              >
                {o.label}
                {!disabled && (
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={(e) => remove(o.value, e)}
                    className="rounded-full hover:bg-muted-foreground/20"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </Badge>
            ))
          )}
        </div>
        <ChevronDown className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        style={{ width: triggerWidth > 0 ? triggerWidth : undefined }}
        className="p-1"
      >
        <div className="max-h-60 overflow-y-auto">
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => toggle(o.value)}
              className={cn(
                "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-left",
                "hover:bg-accent hover:text-accent-foreground",
                value.includes(o.value) && "bg-accent/50"
              )}
            >
              <div className={cn(
                "flex h-4 w-4 items-center justify-center rounded border border-primary shrink-0",
                value.includes(o.value) ? "bg-primary text-primary-foreground" : "opacity-50"
              )}>
                {value.includes(o.value) && <Check className="h-3 w-3" />}
              </div>
              {o.label}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
