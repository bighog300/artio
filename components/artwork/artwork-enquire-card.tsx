"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type ArtworkEnquireCardProps = {
  artworkKey: string;
  artworkTitle: string;
  priceFormatted: string;
  artistName: string;
};

export function ArtworkEnquireCard({ artworkKey, artworkTitle, priceFormatted, artistName }: ArtworkEnquireCardProps) {
  const [view, setView] = useState<"idle" | "open" | "submitting" | "success" | "error">("idle");
  const [buyerName, setBuyerName] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [message, setMessage] = useState("");

  const isBusy = view === "submitting";

  async function submitInquiry() {
    setView("submitting");
    try {
      const res = await fetch(`/api/artwork/${encodeURIComponent(artworkKey)}/enquire`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buyerName,
          buyerEmail,
          message: message.trim() ? message.trim() : undefined,
        }),
      });

      if (!res.ok) {
        setView("error");
        return;
      }

      setView("success");
    } catch {
      setView("error");
    }
  }

  if (view === "success") {
    return (
      <Card>
        <CardContent className="pt-6">
          <p>Your enquiry has been sent. {artistName} will be in touch.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-3xl font-bold">{priceFormatted}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">Enquire about {artworkTitle}</p>
        {view === "open" || view === "submitting" || view === "error" ? (
          <div className="space-y-3">
            <Input placeholder="Name" value={buyerName} disabled={isBusy} onChange={(e) => setBuyerName(e.target.value)} />
            <Input placeholder="Email" value={buyerEmail} disabled={isBusy} onChange={(e) => setBuyerEmail(e.target.value)} />
            <Textarea
              placeholder="Message (optional)"
              value={message}
              disabled={isBusy}
              maxLength={500}
              onChange={(e) => setMessage(e.target.value)}
            />
            {view === "error" ? <p className="text-sm text-destructive">Something went wrong. Please try again.</p> : null}
            <Button onClick={submitInquiry} disabled={isBusy || buyerName.trim().length < 2 || buyerEmail.trim().length < 3}>
              {isBusy ? <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Sending…</span> : "Submit"}
            </Button>
          </div>
        ) : (
          <Button onClick={() => setView("open")}>Enquire about this work</Button>
        )}
      </CardContent>
    </Card>
  );
}
