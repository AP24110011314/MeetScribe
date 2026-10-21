import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

export function Spinner({
  className,
  size = 24,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <div
      className={cn(
        `w-[${size}px] h-[${size}px] rounded-full border-2 border-current border-t-transparent animate-spin`,
        className,
      )}
    >
      <motion.span
        className="absolute width-full height-full rounded-full bg-current opacity-20"
        style={{ animation: "spin 1s linear infinite" }}
      />
    </div>
  );
}