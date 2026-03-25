import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export default function SetupSection({
  title,
  description,
  complete,
  defaultOpen = true,
  children,
}: {
  title: string;
  description?: string;
  complete: boolean;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <Card>
      <details open={defaultOpen}>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-4">
          <div>
            <h2 className="text-base font-semibold">{title}</h2>
            {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
          </div>
          <span className={cn("text-sm", complete ? "text-emerald-600" : "text-muted-foreground")}>
            {complete ? "✓ Complete" : "✕ Incomplete"}
          </span>
        </summary>
        <CardContent>{children}</CardContent>
      </details>
    </Card>
  );
}
