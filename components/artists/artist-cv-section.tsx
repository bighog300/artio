import Link from "next/link";
import type { CvEntryType } from "@prisma/client";

type ArtistCvEntryItem = {
  id: string;
  entryType: CvEntryType;
  title: string;
  organisation: string | null;
  location: string | null;
  year: number;
  endYear: number | null;
  description: string | null;
  url: string | null;
};

const CV_TYPE_LABELS: Record<CvEntryType, string> = {
  EXHIBITION_SOLO: "Solo exhibitions",
  EXHIBITION_GROUP: "Group exhibitions",
  RESIDENCY: "Residencies",
  AWARD: "Awards & prizes",
  EDUCATION: "Education",
  PUBLICATION: "Publications",
  OTHER: "Other",
};

const CV_TYPE_ORDER: CvEntryType[] = [
  "EXHIBITION_SOLO",
  "EXHIBITION_GROUP",
  "RESIDENCY",
  "AWARD",
  "EDUCATION",
  "PUBLICATION",
  "OTHER",
];

export function ArtistCvSection({ entries }: { entries: ArtistCvEntryItem[] }) {
  return (
    <section className="space-y-6">
      {CV_TYPE_ORDER.map((type) => {
        const sectionEntries = entries.filter((entry) => entry.entryType === type);
        if (sectionEntries.length === 0) return null;

        return (
          <div className="space-y-2" key={type}>
            <h3 className="text-base font-semibold">{CV_TYPE_LABELS[type]}</h3>
            <ul className="space-y-2">
              {sectionEntries.map((entry) => (
                <li className="text-sm text-muted-foreground" key={entry.id}>
                  <span>{entry.endYear ? `${entry.year} – ${entry.endYear}` : entry.year}</span>
                  <span> · </span>
                  {entry.url ? (
                    <Link className="underline decoration-muted-foreground/60 underline-offset-2 hover:text-foreground" href={entry.url} rel="noreferrer" target="_blank">
                      {entry.title}
                    </Link>
                  ) : (
                    <span className="text-foreground">{entry.title}</span>
                  )}
                  {entry.organisation || entry.location ? <span> · {[entry.organisation, entry.location].filter(Boolean).join(", ")}</span> : null}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </section>
  );
}
