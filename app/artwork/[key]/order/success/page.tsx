import Link from "next/link";

export default async function ArtworkOrderSuccessPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;

  return (
    <main className="mx-auto max-w-2xl space-y-4 px-4 py-12">
      <h1 className="text-3xl font-semibold">Thank you for your purchase</h1>
      <p className="text-muted-foreground">Your order is confirmed. You&apos;ll receive an email shortly.</p>
      <Link className="underline" href={`/artwork/${key}`}>
        Back to artwork
      </Link>
    </main>
  );
}
