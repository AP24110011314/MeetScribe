import { cn } from "@/lib/utils";
import * as React from "react";
import { motion } from "framer-motion";

type ButtonVariant =
  | "default"
  | "primary"
  | "secondary"
  | "danger"
  | "link";

type ButtonSize = "sm" | "md" | "lg" | "icon";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  disabled?: boolean;
  type?: "button" | "submit" | "reset";
}

const variantStyles: Record<ButtonVariant, string> = {
  default:
    "border border-transparent bg-transparent text-sm font-medium hover:bg-gray-100 dark:hover:bg-gray-900",
  primary:
    "border-2 border-transparent bg-brand-600 px-4 py-2 text-sm font-medium text-brand-foreground hover:bg-brand-500 dark:bg-brand-500 dark:hover:bg-brand-400",
  secondary:
    "border-2 border-brand-600 bg-brand-50 px-4 py-2 text-sm font-medium text-brand-600 hover:bg-brand-100 dark:bg-brand-950/30 dark:hover:bg-brand-800",
  danger:
    "border-2 border-transparent bg-red-50 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-100 dark:bg-red-950/30 dark:hover:bg-red-800",
  link:
    "underline underline-offset-2 text-brand-600 hover underline-opacity-100 dark:text-brand-400",
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-4 py-2 text-sm",
  lg: "px-6 py-3 text-base",
  icon: "p-2",
};

export function Button({
  variant = "primary",
  size = "md",
  loading,
  children,
  className,
  disabled,
  type = "button",
  ...props
}: ButtonProps) {
  const baseClasses = cn(
    "inline-flex items-center justify-center rounded-md focus-visible outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:opacity-50 transition-colors",
    variantStyles[variant],
    sizeStyles[size],
    className,
  );

  if (loading && !disabled) {
    return (
      <button
        disabled
        type={type}
        className={baseClasses}
        aria-label="Loading..."
        {...props}
      >
        <motion.span className="flex items-center gap-2">
          <svg
            className="h-4 w-4 fill-current"
            viewBox="0 0 24 24"
          >
            <circle
              cx="12"
              cy="12"
              r="10"
              className="opacity-25"
            />
            <path
              className="transition-opacity duration-200 ease-in-out"
              fill="currentColor"
              d="M4 12a8 8 0 0 0 8 8M4 12a8 8 0 0 1 8-8m-4-6v14M4 12a8 8 0 0 0 8 8m-4-6v14M-4 12a8 8 0 0 1-8 8m-4-6v14M12 4v16m8-8H4"
            />
          </svg>
          <span className="sr-only">Loading...</span>
        </motion.span>
      </button>
    );
  }

  return (
    <button
      disabled
      type={type}
      className={baseClasses}
      {...props}
    >
      {loading ? (
        <motion.span className="flex items-center gap-2">
          <svg
            className="h-4 w-4 fill-current"
            viewBox="0 0 24 24"
          >
            <circle
              cx="12"
              cy="12"
              r="10"
              className="opacity-25"
            />
            <path
              className="transition-opacity duration-200 ease-in-out"
              fill="currentColor"
              d="M4 12a8 8 0 0 0 8 8M4 12a8 8 0 0 1 8-8m-4-6v14M4 12a8 8 0 0 0 8 8m-4-6v14M-4 12a8 8 0 0 1-8 8m-4-6v14M12 4v16m8-8H4"
            />
          </svg>
          <span className="sr-only">Loading...</span>
        </motion.span>
      ) : (
        children
      )}
    </button>
  );
}