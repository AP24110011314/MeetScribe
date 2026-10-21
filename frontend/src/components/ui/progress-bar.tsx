import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

type ProgressBarVariant = "default" | "success" | "warning" | "danger" | "info";

const variantStyles: Record<ProgressBarVariant, string> = {
  default: "bg-gray-200 dark:bg-gray-800",
  success: "bg-green-500",
  warning: "bg-amber-500",
  danger: "bg-red-500",
  info: "bg-indigo-500",
};

interface ProgressBarProps {
  percent: number;
  variant?: ProgressBarVariant;
  className?: string;
  showLabel?: boolean;
}

export function ProgressBar({
  percent,
  variant = "default",
  className,
  showLabel = true,
}: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));

  return (
    <div className={cn("relative h-2 w-full rounded overflow-hidden", className)}>
      <motion.div
        className={cn("h-full rounded transition-all duration-300", variantStyles[variant])}
        style={{ width: `${clamped}%` }}
        animate={{ width: `${clamped}%` }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      />
      {showLabel && (
        <span className="absolute right-2 text-xs text-gray-400 dark:text-gray-600">
          {clamped}%
        </span>
      )}
    </div>
  );
}