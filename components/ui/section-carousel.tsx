import type { ReactNode } from "react";

export function SectionCarousel({ children }: { children: ReactNode }) {
  return (
    <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 [&>*]:w-[280px] [&>*]:shrink-0 [&>*]:snap-start">
      {children}
    </div>
  );
}
