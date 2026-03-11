"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type Tier = {
  id: string;
  name: string;
  capacity: number | null;
  registered: number;
  available: number | null;
};

type Availability = {
  available: number | null;
  isSoldOut: boolean;
  isRsvpClosed: boolean;
  tiers: Tier[];
};

export function RsvpWidget({ eventSlug, initialAvailability }: { eventSlug: string; initialAvailability: Availability }) {
  const [availability, setAvailability] = useState<Availability>(initialAvailability);
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [tierId, setTierId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmationCode, setConfirmationCode] = useState<string | null>(null);
  const [isWaitlisted, setIsWaitlisted] = useState(false);
  const [waitlistPosition, setWaitlistPosition] = useState<number | null>(null);

  const activeTiers = useMemo(() => availability.tiers.filter((tier) => tier.available == null || tier.available > 0), [availability.tiers]);

  useEffect(() => {
    let mounted = true;
    async function loadAvailability() {
      const res = await fetch(`/api/events/${eventSlug}/availability`, { method: "GET", cache: "no-store" });
      if (!res.ok || !mounted) return;
      const body = await res.json() as Availability;
      if (mounted) setAvailability(body);
    }

    void loadAvailability();
    const timer = setInterval(() => void loadAvailability(), 30_000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, [eventSlug]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    const res = await fetch(`/api/events/${eventSlug}/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ guestName, guestEmail, ...(tierId ? { tierId } : {}) }),
    });

    const body = await res.json().catch(() => ({}));
    if (res.ok) {
      const status = typeof body.status === "string" ? body.status : null;
      if (status === "WAITLISTED") {
        setIsWaitlisted(true);
        setWaitlistPosition(typeof body.waitlistPosition === "number" ? body.waitlistPosition : null);
        setConfirmationCode(null);
      } else {
        setConfirmationCode(body.confirmationCode ?? null);
        setIsWaitlisted(false);
        setWaitlistPosition(null);
      }
      setGuestName("");
      setGuestEmail("");
      setTierId("");
    }
    setIsSubmitting(false);
  }

  if (availability.isRsvpClosed) {
    return <div className="rounded border border-border p-4 text-sm text-muted-foreground">RSVPs are now closed for this event.</div>;
  }

  if (confirmationCode) {
    return (
      <div className="space-y-2 rounded border border-emerald-300 bg-emerald-50 p-4">
        <p className="text-sm text-emerald-800">RSVP confirmed</p>
        <p className="text-2xl font-semibold text-emerald-900" data-testid="confirmation-code">{confirmationCode}</p>
      </div>
    );
  }

  if (isWaitlisted) {
    return (
      <div className="space-y-2 rounded border border-amber-300 bg-amber-50 p-4">
        <p className="text-sm text-amber-900">You&apos;re on the waitlist. We&apos;ll email you if a spot opens up.</p>
        {waitlistPosition ? <p className="text-sm text-amber-800">Current position: #{waitlistPosition}</p> : null}
      </div>
    );
  }

  const isJoiningWaitlist = availability.isSoldOut;

  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded border p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{isJoiningWaitlist ? "Join the waitlist" : "Reserve your spot"}</p>
        <Badge variant={availability.isSoldOut ? "destructive" : "secondary"}>
          {availability.isSoldOut ? "Sold out" : `${availability.available ?? "Unlimited"} spots left`}
        </Badge>
      </div>

      {activeTiers.length > 1 ? (
        <label className="block text-sm">
          Tier
          <select className="mt-1 w-full rounded border p-2" value={tierId} onChange={(e) => setTierId(e.target.value)}>
            <option value="">Select a tier</option>
            {activeTiers.map((tier) => <option key={tier.id} value={tier.id}>{tier.name}</option>)}
          </select>
        </label>
      ) : null}

      <label className="block text-sm">Name<input className="mt-1 w-full rounded border p-2" value={guestName} onChange={(e) => setGuestName(e.target.value)} required disabled={isSubmitting} /></label>
      <label className="block text-sm">Email<input className="mt-1 w-full rounded border p-2" type="email" value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)} required disabled={isSubmitting} /></label>
      <Button type="submit" disabled={isSubmitting}>{isSubmitting ? "Submitting..." : isJoiningWaitlist ? "Join waitlist" : "RSVP"}</Button>
    </form>
  );
}
