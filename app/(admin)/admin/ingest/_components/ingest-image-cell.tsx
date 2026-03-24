"use client";

type ImportStatus = "none" | "imported" | "failed" | "importing";

type Props = {
  imageUrl: string | null;
  blobImageUrl?: string | null;
  importStatus: ImportStatus;
  onImport?: () => void;
  altText?: string;
};

export default function IngestImageCell({
  imageUrl,
  blobImageUrl,
  importStatus,
  onImport,
  altText = "",
}: Props) {
  const displayUrl = blobImageUrl ?? imageUrl;

  return (
    <div className="flex flex-col items-start gap-1">
      {displayUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={displayUrl}
          alt={altText}
          className="h-14 w-20 rounded object-cover bg-muted"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />
      ) : (
        <div className="h-14 w-20 rounded bg-muted" />
      )}

      {importStatus === "imported" && (
        <span className="text-xs text-emerald-700">✓ Imported</span>
      )}
      {importStatus === "failed" && (
        <div className="flex items-center gap-1">
          <span className="text-xs text-destructive">⚠ Failed</span>
          {onImport && (
            <button
              type="button"
              className="text-xs underline text-muted-foreground"
              onClick={onImport}
            >
              Retry
            </button>
          )}
        </div>
      )}
      {importStatus === "importing" && (
        <span className="text-xs text-muted-foreground">Importing…</span>
      )}
      {importStatus === "none" && onImport && (
        <button
          type="button"
          className="text-xs underline text-muted-foreground"
          onClick={onImport}
        >
          Import
        </button>
      )}
      {importStatus === "none" && !imageUrl && !onImport && (
        <span className="text-xs text-muted-foreground">—</span>
      )}
    </div>
  );
}
