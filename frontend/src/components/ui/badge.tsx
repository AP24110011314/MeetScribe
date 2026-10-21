import { cn } from "@/lib/utils";
import * as React from "react";

type BadgeVariant = "default" | "success" | "warning" | "danger" | "info";

const variantStyles: Record<BadgeVariant, string> = {
  default:
    "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
  success:
    "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200",
  warning:
    "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  danger:
    "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
  info:
    "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200",
};

export function Badge({
  variant = "default",
  className,
  children,
}: {
  variant?: BadgeVariant;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span className={cn(variantStyles[variant], className)}>{children}</span>
  );
}