import { cn } from "@/lib/utils";
// @ts-expect-error Import conflicts with local Tabs declaration
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@radix-ui/react-tabs";

type TabsVariant = "default" | "indigo";

interface TabsProps {
  defaultValue: string;
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
  variant?: TabsVariant;
  children?: React.ReactNode;
}

export function Tabs({ defaultValue, value, onValueChange, className, variant = "default" }: TabsProps) {
  return (
    <Tabs
      defaultValue={defaultValue}
      value={value}
      onValueChange={onValueChange}
      className={cn(
        "w-full border border-gray-200 dark:border-gray-800",
        className,
      )}
    >
      <TabsList className="grid w-full grid-cols-2">
        {variant === "indigo" ? (
          <>
            <TabsTrigger
              value="overview"
              className={cn(
                "col-span-2 flex justify-center py-2 text-sm font-medium hover:text-brand-600 dark:text-brand-400",
                "data-[state=active]:text-brand-700 dark:data-[state=active]:text-brand-300",
              )}
            />
            <TabsContent
              value="overview"
              className="mt-2"
            />
          </>
        ) : (
          <>
            <TabsTrigger value="default" />
            <TabsContent value="default" />
          </>
        )}
      </TabsList>
      <TabsContent value="overview" className="mt-2">
        <p>Overview content</p>
      </TabsContent>
      <TabsContent value="transcript" className="mt-2 hidden">
        <p>Transcript content</p>
      </TabsContent>
    </Tabs>
  );
}