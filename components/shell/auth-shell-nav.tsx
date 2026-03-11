"use client";

import Link from "next/link";
import { ArrowLeft, Home } from "lucide-react";

type AuthShellNavProps = {
  title: "Sign in" | "Invitation";
};

export function AuthShellNav({ title }: AuthShellNavProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-background/95 backdrop-blur">
      <div className="mx-auto grid w-full max-w-6xl grid-cols-3 items-center gap-2 px-4 py-3 md:px-6">
        <button
          type="button"
          onClick={() => window.history.back()}
          className="inline-flex w-fit items-center gap-1 rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Go back"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back</span>
        </button>

        <div className="flex flex-col items-center">
          <Link href="/" className="text-base font-semibold tracking-tight">
            Artio
          </Link>
          <p className="text-xs text-muted-foreground">{title}</p>
        </div>

        <Link
          href="/"
          className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Go home"
        >
          <Home className="h-4 w-4" />
          <span>Home</span>
        </Link>
      </div>
    </header>
  );
}
