"use client";

import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";

export function BetaSignOutButton() {
  return (
    <Button
      variant="outline"
      size="sm"
      type="button"
      onClick={() => signOut({ callbackUrl: "/" })}
    >
      Sign out
    </Button>
  );
}
