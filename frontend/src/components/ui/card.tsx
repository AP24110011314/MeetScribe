import { cn } from "@/lib/utils";
import * as React from "react";

interface CardProps {
  className?: string;
  children: React.ReactNode;
}

export function Card({ className, children }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-white p-6 shadow-sm dark:bg-gray-900 dark:border-gray-800",
        className,
      )}
    >
      {children}
    </div>
  );
}