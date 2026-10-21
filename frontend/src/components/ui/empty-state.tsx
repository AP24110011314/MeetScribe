import { cn } from "@/lib/utils";

type EmptyStateVariant = "upload" | "meetings" | "search" | "empty";

const variantStyles: Record<EmptyStateVariant, {
  svg: string;
  title: string;
  description: string;
  ctaText?: string;
  ctaHref?: string;
}> = {
  upload:
    {
      svg:
        '<path d="M14 2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-2m0 0V5a2 2 0 0 1 2-2h2m0 0V5a2 2 0 0 1 2-2m0 0V4m-6 9h6m4 0h4m-4-4h6m4 0h4m-4-4h6"/>',
      title: "No meetings yet",
      description:
        "Upload a recording to get a transcript, summary, and action items.",
      ctaText: "Upload now",
      ctaHref: "/meetings",
    },
  meetings:
    {
      svg:
        '<path d="M14 2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-2m0 0V5a2 2 0 0 1 2-2h2m0 0V5a2 2 0 0 1 2-2m0 0V4m-6 9h6m4 0h4m-4-4h6m4 0h4m-4-4h6"/>',
      title: "No meetings found",
      description:
        "Try adjusting your search or filters.",
      ctaText: "Clear filters",
      ctaHref: "/meetings",
    },
  search:
    {
      svg:
        '<path d="M14 2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-2m0 0V5a2 2 0 0 1 2-2h2m0 0V5a2 2 0 0 1 2-2m0 0V4m-6 9h6m4 0h4m-4-4h6m4 0h4m-4-4h6"/>',
      title: "Nothing matches",
      description:
        "Try different keywords or adjust the date range.",
      ctaText: "Search again",
      ctaHref: "/meetings",
    },
  empty:
    {
      svg:
        '<path d="M14 2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-2m0 0V5a2 2 0 0 1 2-2h2m0 0V5a2 2 0 0 1 2-2m0 0V4m-6 9h6m4 0h4m-4-4h6m4 0h4m-4-4h6"/>',
      title: "No content yet",
      description:
        "Start by uploading a meeting recording.",
      ctaText: "Upload now",
      ctaHref: "/meetings",
    },
};

export function EmptyState({
  variant = "empty",
  className,
}: {
  variant?: EmptyStateVariant;
  className?: string;
}) {
  const { svg, title, description, ctaText, ctaHref } =
    variantStyles[variant];

  return (
    <div className={cn("text-center py-16", className)}>
      <div className="mx-auto mb-4">
        <svg
          className="h-16 w-16 text-gray-300 dark:text-gray-600"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          {svg}
        </svg>
      </div>
      <h2 className="text-xl font-medium text-gray-800 dark:text-gray-100 mb-2">
        {title}
      </h2>
      <p className="text-gray-500 dark:text-gray-400 mb-6">
        {description}
      </p>
      {ctaText && ctaHref && (
        <a
          href={ctaHref}
          className="inline-flex items-center rounded-md border px-4 py-2 text-sm font-medium text-brand-600 hover:text-brand-700 dark:text-brand-300 dark:hover:text-brand-200"
        >
          {ctaText}
          <svg
            className="rtl:rotate-180 inline-block mr-1.5 h-4 w-4"
            viewBox="0 0 24 22"
            fill="currentColor"
          >
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </a>
      )}
    </div>
  );
}