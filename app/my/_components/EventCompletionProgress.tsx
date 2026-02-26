import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Checks = {
  basics: boolean;
  schedule: boolean;
  location: boolean;
  images: boolean;
  readyToSubmit: boolean;
};

const ITEMS: Array<{ key: keyof Checks; label: string }> = [
  { key: "basics", label: "Basics" },
  { key: "schedule", label: "Schedule" },
  { key: "location", label: "Location" },
  { key: "images", label: "Images" },
  { key: "readyToSubmit", label: "Ready to submit" },
];

export default function EventCompletionProgress({ checks }: { checks: Checks }) {
  const completeCount = ITEMS.filter((item) => checks[item.key]).length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Completion progress</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm font-medium">{completeCount} of {ITEMS.length} complete</p>
        <ul className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-5">
          {ITEMS.map((item) => (
            <li key={item.key} className="flex items-center gap-2 rounded border px-3 py-2">
              <span aria-hidden>{checks[item.key] ? "✓" : "✕"}</span>
              <span>{item.label}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
