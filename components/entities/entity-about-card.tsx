import Link from "next/link";
import { ExternalLink, Globe, Instagram, Linkedin, MapPin, Music2, Twitter, Youtube } from "lucide-react";
import { Card } from "@/components/ui/card";

type EntityAboutCardProps = {
  description?: string | null;
  websiteUrl?: string | null;
  instagramUrl?: string | null;
  facebookUrl?: string | null;
  twitterUrl?: string | null;
  linkedinUrl?: string | null;
  tiktokUrl?: string | null;
  youtubeUrl?: string | null;
  address?: string | null;
  mapHref?: string | null;
  tags?: string[];
};

export function EntityAboutCard({ description, websiteUrl, instagramUrl, facebookUrl, twitterUrl, linkedinUrl, tiktokUrl, youtubeUrl, address, mapHref, tags = [] }: EntityAboutCardProps) {
  const hasContent = Boolean(description || websiteUrl || instagramUrl || facebookUrl || twitterUrl || linkedinUrl || tiktokUrl || youtubeUrl || address || tags.length);
  if (!hasContent) return <Card className="p-4 text-sm text-muted-foreground">More details coming soon.</Card>;

  return (
    <Card className="space-y-3 p-4">
      {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      {address ? <p className="text-sm">{address}</p> : null}
      <div className="flex flex-wrap gap-3 text-sm">
        {websiteUrl ? <Link href={websiteUrl} target="_blank" className="inline-flex items-center gap-1.5 underline hover:text-foreground"><Globe className="h-3.5 w-3.5" aria-hidden="true" />Website</Link> : null}
        {instagramUrl ? <Link href={instagramUrl} target="_blank" className="inline-flex items-center gap-1.5 underline hover:text-foreground"><Instagram className="h-3.5 w-3.5" aria-hidden="true" />Instagram</Link> : null}
        {facebookUrl ? <Link href={facebookUrl} target="_blank" className="inline-flex items-center gap-1.5 underline hover:text-foreground"><ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />Facebook</Link> : null}
        {twitterUrl ? <Link href={twitterUrl} target="_blank" className="inline-flex items-center gap-1.5 underline hover:text-foreground"><Twitter className="h-3.5 w-3.5" aria-hidden="true" />Twitter / X</Link> : null}
        {linkedinUrl ? <Link href={linkedinUrl} target="_blank" className="inline-flex items-center gap-1.5 underline hover:text-foreground"><Linkedin className="h-3.5 w-3.5" aria-hidden="true" />LinkedIn</Link> : null}
        {tiktokUrl ? <Link href={tiktokUrl} target="_blank" className="inline-flex items-center gap-1.5 underline hover:text-foreground"><Music2 className="h-3.5 w-3.5" aria-hidden="true" />TikTok</Link> : null}
        {youtubeUrl ? <Link href={youtubeUrl} target="_blank" className="inline-flex items-center gap-1.5 underline hover:text-foreground"><Youtube className="h-3.5 w-3.5" aria-hidden="true" />YouTube</Link> : null}
        {mapHref ? <Link href={mapHref} target="_blank" className="inline-flex items-center gap-1.5 underline hover:text-foreground"><MapPin className="h-3.5 w-3.5" aria-hidden="true" />Open in Maps</Link> : null}
      </div>
      {tags.length ? <p className="text-xs text-muted-foreground">{tags.slice(0, 8).join(" • ")}</p> : null}
    </Card>
  );
}
