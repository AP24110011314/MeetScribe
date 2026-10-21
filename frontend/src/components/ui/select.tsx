import { cn } from "@/lib/utils";
import * as React from "react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@radix-ui/react-dropdown-menu";

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps extends React.RefAttributes<HTMLDivElement> {
  label?: string;
  options: SelectOption[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function Select({
  label,
  options,
  value,
  onValueChange,
  placeholder,
  className,
  ...props
}: SelectProps) {
  return (
    <div className="space-y-1.5" {...props}>
      {label && (
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          {label}
        </label>
      )}
      <div
        role="select"
        aria-label={label || "Select"}
        className={cn(
          "relative w-full rounded border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:opacity-50",
          className,
        )}
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              onClick={(e) => e.stopPropagation()}
              className="w-full rounded-md py-2 pl-8 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
            >
              {placeholder || value}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={4}>
            {options.map((option) => (
              <DropdownMenuItem
                key={option.value}
                onSelect={() => onValueChange(option.value)}
                className="flex items-center rounded-sm px-2 py-1.5 text-sm focus-visible:bg-brand-100 focus-visible:text-brand-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 data-[disabled]:pointer-events-none data-[disabled]:opacity-40"
              >
                {option.label}
              </DropdownMenuItem>
            ))}
            {options.length === 0 && (
              <span className="flex items-center justify-center h-6 w-6 text-muted-foreground">
                No options available
              </span>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}