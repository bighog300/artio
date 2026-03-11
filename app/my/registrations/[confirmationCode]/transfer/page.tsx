"use client";

import { FormEvent, useMemo, useState } from "react";
import { useParams } from "next/navigation";

type TransferResponse = {
  error?: string;
};

export default function TransferPage() {
  const params = useParams<{ confirmationCode: string }>();
  const confirmationCode = params.confirmationCode;

  const endpoint = useMemo(() => {
    return `/api/registrations/${encodeURIComponent(confirmationCode)}/transfer`;
  }, [confirmationCode]);

  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setIsSubmitting(true);
    setSuccessMessage("");
    setErrorMessage("");

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ newName, newEmail }),
      });

      if (!response.ok) {
        let message = "Failed to transfer ticket.";
        try {
          const data = (await response.json()) as TransferResponse;
          if (data.error) {
            message = data.error;
          }
        } catch {
          // Ignore invalid JSON and keep fallback message.
        }

        setErrorMessage(message);
        return;
      }

      setSuccessMessage("Ticket transferred successfully.");
      setNewName("");
      setNewEmail("");
    } catch {
      setErrorMessage("Failed to transfer ticket.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="mx-auto max-w-xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Transfer ticket</h1>
        <p className="text-sm text-muted-foreground">
          Transfer this confirmed registration to a new attendee.
        </p>
      </header>

      <form className="space-y-4 rounded border p-4" onSubmit={handleSubmit}>
        <label className="block space-y-1 text-sm">
          <span>New attendee name</span>
          <input
            className="w-full rounded border px-3 py-2"
            name="newName"
            required
            minLength={2}
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
          />
        </label>

        <label className="block space-y-1 text-sm">
          <span>New attendee email</span>
          <input
            type="email"
            className="w-full rounded border px-3 py-2"
            name="newEmail"
            required
            value={newEmail}
            onChange={(event) => setNewEmail(event.target.value)}
          />
        </label>

        <button
          type="submit"
          className="rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-60"
          disabled={isSubmitting}
        >
          {isSubmitting ? "Transferring..." : "Transfer ticket"}
        </button>

        {successMessage ? <p className="text-sm text-green-700">{successMessage}</p> : null}
        {errorMessage ? <p className="text-sm text-red-700">{errorMessage}</p> : null}
      </form>
    </main>
  );
}
