"use client";

import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

export function ArtworkPurchaseCard({
  artworkKey,
  artworkTitle,
  priceFormatted,
  artistName,
  artistStripeReady,
  isSold,
  priceAmount,
  currency,
  initialOfferAmountMajor,
}: {
  artworkKey: string;
  artworkTitle: string;
  priceFormatted: string;
  artistName: string;
  artistStripeReady: boolean;
  isSold: boolean;
  priceAmount: number;
  currency: string;
  initialOfferAmountMajor?: number;
}) {
  const [buying, setBuying] = useState(false);
  const [buyError, setBuyError] = useState<string | null>(null);
  const [buyerName, setBuyerName] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");

  const [enquirySubmitting, setEnquirySubmitting] = useState(false);
  const [enquiryError, setEnquiryError] = useState<string | null>(null);
  const [enquirySuccess, setEnquirySuccess] = useState(false);
  const [enquiryName, setEnquiryName] = useState("");
  const [enquiryEmail, setEnquiryEmail] = useState("");
  const [enquiryMessage, setEnquiryMessage] = useState("");

  const defaultOfferAmount = useMemo(() => initialOfferAmountMajor ?? (priceAmount / 100) * 0.8, [initialOfferAmountMajor, priceAmount]);
  const [offerSubmitting, setOfferSubmitting] = useState(false);
  const [offerError, setOfferError] = useState<string | null>(null);
  const [offerSuccess, setOfferSuccess] = useState(false);
  const [offerName, setOfferName] = useState("");
  const [offerEmail, setOfferEmail] = useState("");
  const [offerAmount, setOfferAmount] = useState(defaultOfferAmount.toFixed(2));
  const [offerMessage, setOfferMessage] = useState("");

  const offerEnabled = artistStripeReady && priceAmount > 0;

  if (isSold) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-3xl font-bold">{priceFormatted}</CardTitle>
        </CardHeader>
        <CardContent>
          <span className="inline-flex rounded-full bg-muted px-3 py-1 text-sm font-medium">Sold</span>
        </CardContent>
      </Card>
    );
  }

  if (!artistStripeReady) {
    return (
      <ArtworkEnquireCard
        artworkKey={artworkKey}
        artworkTitle={artworkTitle}
        priceFormatted={priceFormatted}
        artistName={artistName}
      />
    );
  }

  async function submitPurchase() {
    setBuying(true);
    setBuyError(null);
    try {
      const res = await fetch(`/api/artwork/${encodeURIComponent(artworkKey)}/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ buyerName, buyerEmail }),
      });

      const payload = (await res.json().catch(() => ({}))) as { url?: string; error?: { message?: string } };
      if (!res.ok || !payload.url) {
        setBuyError(payload.error?.message ?? "Unable to start checkout. Please try again.");
        setBuying(false);
        return;
      }

      window.location.href = payload.url;
    } catch {
      setBuyError("Unable to start checkout. Please try again.");
      setBuying(false);
    }
  }

  async function submitEnquiry() {
    setEnquirySubmitting(true);
    setEnquiryError(null);
    try {
      const res = await fetch(`/api/artwork/${encodeURIComponent(artworkKey)}/enquire`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buyerName: enquiryName,
          buyerEmail: enquiryEmail,
          message: enquiryMessage.trim() ? enquiryMessage.trim() : undefined,
        }),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        setEnquiryError(payload.error?.message ?? "Unable to submit enquiry. Please try again.");
        setEnquirySubmitting(false);
        return;
      }
      setEnquirySuccess(true);
    } catch {
      setEnquiryError("Unable to submit enquiry. Please try again.");
      setEnquirySubmitting(false);
    }
  }

  async function submitOffer() {
    setOfferSubmitting(true);
    setOfferError(null);
    try {
      const amount = Number(offerAmount);
      const res = await fetch(`/api/artwork/${encodeURIComponent(artworkKey)}/offer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buyerName: offerName,
          buyerEmail: offerEmail,
          offerAmount: amount,
          message: offerMessage.trim() ? offerMessage.trim() : undefined,
        }),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        setOfferError(payload.error?.message ?? "Unable to submit offer. Please try again.");
        setOfferSubmitting(false);
        return;
      }
      setOfferSuccess(true);
    } catch {
      setOfferError("Unable to submit offer. Please try again.");
      setOfferSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-3xl font-bold">{priceFormatted}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Tabs defaultValue="buy" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="buy">Buy now</TabsTrigger>
            {offerEnabled ? <TabsTrigger value="offer">Make an offer</TabsTrigger> : null}
            <TabsTrigger value="enquire">Enquire</TabsTrigger>
          </TabsList>

          <TabsContent value="buy" className="space-y-3 pt-2">
            <Input placeholder="Name" value={buyerName} disabled={buying} onChange={(e) => setBuyerName(e.target.value)} />
            <Input placeholder="Email" value={buyerEmail} disabled={buying} onChange={(e) => setBuyerEmail(e.target.value)} />
            {buyError ? <p className="text-sm text-destructive">{buyError}</p> : null}
            <Button onClick={submitPurchase} disabled={buying || buyerName.trim().length < 2 || buyerEmail.trim().length < 3}>
              {buying ? <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Redirecting…</span> : "Complete purchase"}
            </Button>
          </TabsContent>

          {offerEnabled ? (
            <TabsContent value="offer" className="space-y-3 pt-2">
              {offerSuccess ? <p className="text-sm text-emerald-700">Your offer has been sent to {artistName}.</p> : null}
              <Input placeholder="Name" value={offerName} disabled={offerSubmitting || offerSuccess} onChange={(e) => setOfferName(e.target.value)} />
              <Input placeholder="Email" value={offerEmail} disabled={offerSubmitting || offerSuccess} onChange={(e) => setOfferEmail(e.target.value)} />
              <Input
                placeholder="Offer amount"
                type="number"
                min="0.01"
                step="0.01"
                value={offerAmount}
                disabled={offerSubmitting || offerSuccess}
                onChange={(e) => setOfferAmount(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">In {currency.toUpperCase()} (pre-filled at 80% of asking price).</p>
              <Textarea
                placeholder="Message (optional)"
                value={offerMessage}
                maxLength={1000}
                disabled={offerSubmitting || offerSuccess}
                onChange={(e) => setOfferMessage(e.target.value)}
              />
              {offerError ? <p className="text-sm text-destructive">{offerError}</p> : null}
              <Button
                onClick={submitOffer}
                disabled={
                  offerSubmitting ||
                  offerSuccess ||
                  offerName.trim().length < 2 ||
                  offerEmail.trim().length < 3 ||
                  Number(offerAmount) <= 0
                }
              >
                {offerSubmitting ? <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Sending…</span> : "Send offer"}
              </Button>
            </TabsContent>
          ) : null}

          <TabsContent value="enquire" className="space-y-3 pt-2">
            {enquirySuccess ? <p className="text-sm text-emerald-700">Your enquiry has been sent. {artistName} will be in touch.</p> : null}
            <Input placeholder="Name" value={enquiryName} disabled={enquirySubmitting || enquirySuccess} onChange={(e) => setEnquiryName(e.target.value)} />
            <Input placeholder="Email" value={enquiryEmail} disabled={enquirySubmitting || enquirySuccess} onChange={(e) => setEnquiryEmail(e.target.value)} />
            <Textarea
              placeholder="Message (optional)"
              value={enquiryMessage}
              disabled={enquirySubmitting || enquirySuccess}
              maxLength={500}
              onChange={(e) => setEnquiryMessage(e.target.value)}
            />
            {enquiryError ? <p className="text-sm text-destructive">{enquiryError}</p> : null}
            <Button
              onClick={submitEnquiry}
              disabled={enquirySubmitting || enquirySuccess || enquiryName.trim().length < 2 || enquiryEmail.trim().length < 3}
            >
              {enquirySubmitting ? <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Sending…</span> : "Submit enquiry"}
            </Button>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
