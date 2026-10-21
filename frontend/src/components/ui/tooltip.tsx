import { cn } from "@/lib/utils";
// @ts-expect-error Import conflicts with local Tooltip declaration
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from "@radix-ui/react-tooltip";

type TooltipPlacement = "top" | "bottom" | "left" | "right";

export function Tooltip({
  children,
  placement = "top",
  className,
}: {
  children: React.ReactNode;
  placement?: TooltipPlacement;
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipProvider>
        <TooltipTrigger asChild>
          {children}
        </TooltipTrigger>
        <TooltipContent
          side={placement}
          className={cn(
            "tooltip-box opacity-100",
            placement === "top"
              ? "bottom-full left-1/2 translate-x-1/2"
              : placement === "bottom"
                ? "top-full left-1/2 translate-x-1/2"
                : placement === "left"
                  ? "right-full top-1/2 -translate-y-1/2"
                  : "left-full top-1/2 -translate-y-1/2",
            className,
          )}
        />
      </TooltipProvider>
    </Tooltip>
  );
}

/* TooltipTailwind styles can be applied via className props */