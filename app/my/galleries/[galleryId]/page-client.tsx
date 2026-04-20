"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type GalleryItem = { entityId: string; caption: string | null; commentary: string | null; sortOrder: number };

export function GalleryEditor({ gallery, artworks }: {
  gallery: { id: string; title: string; description: string | null; status: "DRAFT" | "PUBLISHED" | "ARCHIVED"; publishedAt: string | Date | null; scheduledPublishAt: string | Date | null; items: GalleryItem[] };
  artworks: Array<{ id: string; title: string; slug: string | null }>;
}) {
  const router = useRouter();
  const [step, setStep] = useState<"content" | "preview" | "publish">("content");
  const [title, setTitle] = useState(gallery.title);
  const [description, setDescription] = useState(gallery.description ?? "");
  const [items, setItems] = useState<GalleryItem[]>(gallery.items);
  const [scheduleAt, setScheduleAt] = useState("");
  const [saving, setSaving] = useState(false);

  const selectedIds = useMemo(() => new Set(items.map((i) => i.entityId)), [items]);

  async function saveDraft() {
    setSaving(true);
    await fetch(`/api/my/galleries/${gallery.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ title, description }) });
    await fetch(`/api/my/galleries/${gallery.id}/items`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ items }) });
    setSaving(false);
    router.refresh();
  }

  async function publishNow() {
    await saveDraft();
    await fetch(`/api/my/galleries/${gallery.id}/publish`, { method: "POST" });
    router.refresh();
  }

  async function archive() {
    await fetch(`/api/my/galleries/${gallery.id}/archive`, { method: "POST" });
    router.refresh();
  }

  async function schedule() {
    if (!scheduleAt) return;
    await saveDraft();
    await fetch(`/api/my/galleries/${gallery.id}/schedule`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ publishAt: new Date(scheduleAt).toISOString() }) });
    router.refresh();
  }

  return (
    <main className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Gallery editor</h1>
        <p className="text-sm text-muted-foreground">State: {gallery.status} · Flow: Create → Preview → Publish</p>
      </header>
      <div className="flex gap-2 text-sm">
        {(["content", "preview", "publish"] as const).map((s, index) => <button key={s} type="button" onClick={() => setStep(s)} className={`rounded border px-3 py-1 ${step === s ? "bg-muted font-medium" : ""}`}>{index + 1}. {s}</button>)}
      </div>

      {step === "content" ? (
        <section className="space-y-4 rounded border p-4">
          <label className="block text-sm">Title<input className="mt-1 w-full rounded border p-2" value={title} onChange={(e) => setTitle(e.target.value)} /></label>
          <label className="block text-sm">Description<textarea className="mt-1 w-full rounded border p-2" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} /></label>
          <div className="space-y-2">
            <p className="text-sm font-medium">Artwork selection + order</p>
            <div className="space-y-2">
              {items.map((item, index) => {
                const artwork = artworks.find((a) => a.id === item.entityId);
                return (
                  <div key={item.entityId} className="space-y-2 rounded border p-2">
                    <div className="flex items-center justify-between text-sm"><span>{artwork?.title ?? item.entityId}</span><span>#{index + 1}</span></div>
                    <div className="flex gap-2">
                      <Button type="button" size="sm" variant="outline" disabled={index===0} onClick={() => setItems((current) => current.map((x, i) => i===index-1 ? current[index] : i===index ? current[index-1] : x).map((x,i)=>({...x, sortOrder:i})))}>↑</Button>
                      <Button type="button" size="sm" variant="outline" disabled={index===items.length-1} onClick={() => setItems((current) => current.map((x, i) => i===index+1 ? current[index] : i===index ? current[index+1] : x).map((x,i)=>({...x, sortOrder:i})))}>↓</Button>
                    </div>
                    <input className="w-full rounded border p-2 text-sm" placeholder="Caption" value={item.caption ?? ""} onChange={(e) => setItems((cur)=>cur.map((x)=>x.entityId===item.entityId?{...x, caption:e.target.value}:x))} />
                    <textarea className="w-full rounded border p-2 text-sm" placeholder="Commentary" value={item.commentary ?? ""} onChange={(e) => setItems((cur)=>cur.map((x)=>x.entityId===item.entityId?{...x, commentary:e.target.value}:x))} />
                  </div>
                );
              })}
            </div>
            <div className="max-h-52 overflow-auto rounded border p-2 text-sm">
              {artworks.filter((art) => !selectedIds.has(art.id)).map((art) => (
                <button key={art.id} type="button" className="block w-full rounded p-1 text-left hover:bg-muted" onClick={() => setItems((current) => [...current, { entityId: art.id, caption: null, commentary: null, sortOrder: current.length }])}>+ {art.title}</button>
              ))}
            </div>
          </div>
          <Button type="button" onClick={() => void saveDraft()} disabled={saving}>{saving ? "Saving…" : "Save draft"}</Button>
        </section>
      ) : null}

      {step === "preview" ? (
        <section className="space-y-3 rounded border p-4">
          <h2 className="text-lg font-semibold">Preview</h2>
          <p className="text-sm text-muted-foreground">This is what users see on the gallery page.</p>
          <h3 className="text-xl font-semibold">{title}</h3>
          <p className="text-sm text-muted-foreground">{description}</p>
          <ol className="space-y-2">
            {items.map((item, index) => {
              const artwork = artworks.find((a) => a.id === item.entityId);
              return <li key={item.entityId} className="rounded border p-2 text-sm"><p className="font-medium">#{index + 1} {artwork?.title}</p>{item.caption ? <p>{item.caption}</p> : null}{item.commentary ? <p className="text-muted-foreground">{item.commentary}</p> : null}</li>;
            })}
          </ol>
        </section>
      ) : null}

      {step === "publish" ? (
        <section className="space-y-3 rounded border p-4">
          <h2 className="text-lg font-semibold">Publish options</h2>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => void publishNow()}>Publish now</Button>
            <Button type="button" variant="outline" onClick={() => void archive()}>Archive</Button>
          </div>
          <div className="rounded border p-3">
            <label className="block text-sm">Schedule publish
              <input className="mt-1 w-full rounded border p-2" type="datetime-local" value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} />
            </label>
            <Button type="button" variant="outline" className="mt-2" onClick={() => void schedule()} disabled={!scheduleAt}>Schedule</Button>
          </div>
        </section>
      ) : null}
    </main>
  );
}
