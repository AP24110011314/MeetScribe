import { cn } from "@/lib/utils";

/** Skeleton line for text rows */
export function SkeletonLine({
  className,
  width = "100%",
  height = "1rem",
}: {
  className?: string;
  width?: string;
  height?: string;
}) {
  return (
    <div
      className={cn(
        "rounded bg-gray-200 dark:bg-gray-800 h-px w-full",
        height !== undefined ? `h-${height}` : "",
        width !== undefined ? `w-[${width}]` : "",
        className,
      )}
    />
  );
}

/** Skeleton avatar */
export function SkeletonAvatar({
  className,
  size = 32,
}: {
  className?: string;
  size?: number;
}) {
  const sizeVal = size === 32 ? "w-8 h-8" : size === 48 ? "w-12 h-12" : "w-8 h-8";
  return (
    <div className={cn("rounded-full", sizeVal, className)} />
  );
}

/** Skeleton paragraph */
export function SkeletonParagraph({
  className,
  lines = 3,
}: {
  className?: string;
  lines?: number;
}) {
  return (
    <div className={cn(className)}>
      {[...Array(lines)].map((i) => (
        <SkeletonLine
          key={i}
          height={`${0.8 + i * 0.4}rem`}
          width="70%"
        />
      ))}
    </div>
  );
}

/** Skeleton button */
export function SkeletonButton({
  className,
}: {
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-md h-10 w-full bg-gray-200 dark:bg-gray-800 animate-bounce",
        className,
      )}
    />
  );
}