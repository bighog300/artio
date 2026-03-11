"use client";

import { FormEvent, useState } from "react";
import { useSearchParams } from "next/navigation";

export default function TransferTicketPage({ params }: { params: { confirmationCode: string } }) {
  const searchParams = useSearchParams();
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(false);
    setIsSubmitting(true);

    const emailQuery = searchParams.get("email")?.trim();
    const endpoint = emailQuery
      ? `/api/registrations/${params.confirmationCode}/transfer?email=${encodeURIComponent(emailQuery)}`
      : `/api/registrations/${params.confirmationCode}/transfer`;

    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ newName, newEmail }),
    });

    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body?.error?.message ?? "Unable to transfer ticket");
      setIsSubmitting(false);
      return;
    }

    setSuccess(true);
    setIsSubmitting(false);
  }

  return (
    <main className="mx-auto max-w-xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Transfer ticket</h1>
        <p className="text-sm text-muted-foreground">Transfer this confirmed registration to a new attendee.</p>
      </header>

      <form className="space-y-4 rounded border p-4" onSubmit={onSubmit}>
        <label className="block space-y-1 text-sm">
          <span>New attendee name</span>
          <input
            className="w-full rounded border px-3 py-2"
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            required
            minLength={2}
          />
        </label>

        <label className="block space-y-1 text-sm">
          <span>New attendee email</span>
          <input
            type="email"
            className="w-full rounded border px-3 py-2"
            value={newEmail}
            onChange={(event) => setNewEmail(event.target.value)}
            required
          />
        </label>

        <button type="submit" className="rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-60" disabled={isSubmitting}>
          {isSubmitting ? "Transferring..." : "Transfer ticket"}
        </button>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {success ? <p className="text-sm text-green-700">Transfer complete. A confirmation email has been sent to the new attendee.</p> : null}
      </form>
    </main>
  );
}
