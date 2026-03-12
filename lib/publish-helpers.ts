export function publishedStateAt(publishedAt: Date) {
  return {
    isPublished: true as const,
    status: "PUBLISHED" as const,
    publishedAt,
  };
}
