"use client";

export type SuggestionRow = {
  id: string;
  entityType: "VENUE" | "ARTIST" | "EVENT";
  region: string;
  country: string;
  template: string;
  rationale: string;
  status: "PENDING" | "APPROVED" | "DISMISSED";
  createdAt: string | Date;
};

type Props = {
  rows: SuggestionRow[];
  onApprove: (id: string) => Promise<void>;
  onDismiss: (id: string) => Promise<void>;
  approving: Record<string, boolean>;
  dismissing: Record<string, boolean>;
};

function statusClass(status: SuggestionRow["status"]) {
  if (status === "PENDING") return "rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 text-xs";
  if (status === "APPROVED") return "rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5 text-xs";
  return "rounded-full bg-muted text-muted-foreground px-2 py-0.5 text-xs";
}

function statusLabel(status: SuggestionRow["status"]) {
  if (status === "PENDING") return "Pending";
  if (status === "APPROVED") return "Approved";
  return "Dismissed";
}

export function SuggestionsPanel({ rows, onApprove, onDismiss, approving, dismissing }: Props) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border bg-background p-6 text-sm text-muted-foreground">
        No suggestions yet. Use the Generate button to create AI-powered template suggestions.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-3 py-2">Template</th>
            <th className="px-3 py-2">Entity</th>
            <th className="px-3 py-2">Region</th>
            <th className="px-3 py-2">Rationale</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b align-top last:border-0">
              <td className="px-3 py-2">
                <span className="block max-w-[240px] truncate font-mono text-xs" title={row.template}>
                  {row.template}
                </span>
              </td>
              <td className="px-3 py-2 text-xs text-muted-foreground">{row.entityType}</td>
              <td className="px-3 py-2 text-xs text-muted-foreground">{row.region}, {row.country}</td>
              <td className="px-3 py-2">
                <span className="block max-w-[280px] truncate text-sm italic text-muted-foreground" title={row.rationale}>
                  {row.rationale}
                </span>
              </td>
              <td className="px-3 py-2">
                <span className={statusClass(row.status)}>{statusLabel(row.status)}</span>
              </td>
              <td className="px-3 py-2 text-right">
                {row.status === "PENDING" ? (
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      disabled={approving[row.id]}
                      onClick={() => void onApprove(row.id)}
                      className="rounded border border-emerald-600 bg-emerald-50 px-2 py-1 text-xs text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
                    >
                      {approving[row.id] ? "Approving…" : "Approve"}
                    </button>
                    <button
                      type="button"
                      disabled={dismissing[row.id]}
                      onClick={() => void onDismiss(row.id)}
                      className="rounded border px-2 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
                    >
                      {dismissing[row.id] ? "Dismissing…" : "Dismiss"}
                    </button>
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
