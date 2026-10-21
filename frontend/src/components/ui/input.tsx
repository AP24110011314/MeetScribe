import { cn } from "@/lib/utils";
import * as React from "react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  placeholder?: string;
  type?: string;
  disabled?: boolean;
  error?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export function Input({
  label,
  placeholder,
  type = "text",
  disabled,
  error,
  leftIcon,
  rightIcon,
  className,
  ...props
}: InputProps) {
  return (
    <div className="space-y-1.5">
      {label && (
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          {label}
        </label>
      )}
      <input
        type={type}
        disabled={disabled}
        placeholder={placeholder}
        className={cn(
          "block w-full rounded border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-900 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:opacity-50",
          className,
        )}
        {...props}
      />
      {leftIcon && (
        <span className="absolute left-3 select-none text-gray-400 dark:text-gray-600">
          {leftIcon}
        </span>
      )}
      {rightIcon && (
        <span
          className="absolute right-3 select-none text-gray-400 dark:text-gray-600"
        >
          {rightIcon}
        </span>
      )}
      {error && (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}