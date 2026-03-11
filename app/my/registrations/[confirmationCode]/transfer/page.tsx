

  return (
    <main className="mx-auto max-w-xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Transfer ticket</h1>
        <p className="text-sm text-muted-foreground">Transfer this confirmed registration to a new attendee.</p>
      </header>

      <form className="space-y-4 rounded border p-4" method="post" action={endpoint}>
        <label className="block space-y-1 text-sm">
          <span>New attendee name</span>
          <input className="w-full rounded border px-3 py-2" name="newName" required minLength={2} />
        </label>

        <label className="block space-y-1 text-sm">
          <span>New attendee email</span>
          <input type="email" className="w-full rounded border px-3 py-2" name="newEmail" required />
        </label>

        <button type="submit" className="rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-60">
          Transfer ticket
        </button>
      </form>
    </main>
  );
}
