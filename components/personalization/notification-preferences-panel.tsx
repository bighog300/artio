"use client";

import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { track } from "@/lib/analytics/client";

type NotificationPrefs = {
  eventRemindersEnabled: boolean;
  followedCreatorUpdatesEnabled: boolean;
  nearbyRecommendationsEnabled: boolean;
  quietHoursEnabled: boolean;
  quietHoursStartHour: number;
  quietHoursEndHour: number;
};

export function NotificationPreferencesPanel({ initial }: { initial: NotificationPrefs }) {
  const [prefs, setPrefs] = useState<NotificationPrefs>(initial);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function save(next: Partial<NotificationPrefs>) {
    setSaving(true);
    setMessage(null);
    const updated = { ...prefs, ...next };
    setPrefs(updated);
    try {
      const response = await fetch("/api/me/notification-preferences", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(next),
      });
      if (!response.ok) throw new Error("save_failed");
      track("notification_preferences_updated", { source: "preferences" });
      setMessage("Saved notification preferences.");
    } catch {
      setMessage("Could not save notification preferences.");
      setPrefs(prefs);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <h2 className="text-lg font-semibold">Notification preferences</h2>
      <p className="mt-1 text-xs text-muted-foreground">Control reminder and follow update notifications.</p>
      <div className="mt-4 grid gap-4">
        <ToggleRow
          label="Event reminders"
          description="Enable reminder notifications for events you saved reminders on."
          checked={prefs.eventRemindersEnabled}
          disabled={saving}
          onCheckedChange={(value) => void save({ eventRemindersEnabled: value })}
        />
        <ToggleRow
          label="Followed creator updates"
          description="Receive updates when followed artists/venues publish events."
          checked={prefs.followedCreatorUpdatesEnabled}
          disabled={saving}
          onCheckedChange={(value) => void save({ followedCreatorUpdatesEnabled: value })}
        />
        <ToggleRow
          label="Nearby recommendations"
          description="Allow recommendation notifications based on your location radius."
          checked={prefs.nearbyRecommendationsEnabled}
          disabled={saving}
          onCheckedChange={(value) => void save({ nearbyRecommendationsEnabled: value })}
        />
        <ToggleRow
          label="Quiet hours"
          description="Suppress reminder/follow notifications during selected hours."
          checked={prefs.quietHoursEnabled}
          disabled={saving}
          onCheckedChange={(value) => void save({ quietHoursEnabled: value })}
        />

        <div className="grid gap-2 sm:grid-cols-2">
          <label className="grid gap-1 text-sm">
            <span className="font-medium">Quiet start hour</span>
            <select
              className="w-full rounded border border-border bg-background px-2 py-1"
              value={prefs.quietHoursStartHour}
              onChange={(event) => void save({ quietHoursStartHour: Number(event.target.value) })}
              disabled={saving}
            >
              {Array.from({ length: 24 }, (_, hour) => (
                <option key={`start-${hour}`} value={hour}>{hour.toString().padStart(2, "0")}:00</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium">Quiet end hour</span>
            <select
              className="w-full rounded border border-border bg-background px-2 py-1"
              value={prefs.quietHoursEndHour}
              onChange={(event) => void save({ quietHoursEndHour: Number(event.target.value) })}
              disabled={saving}
            >
              {Array.from({ length: 24 }, (_, hour) => (
                <option key={`end-${hour}`} value={hour}>{hour.toString().padStart(2, "0")}:00</option>
              ))}
            </select>
          </label>
        </div>

        {message ? <p className="text-xs text-muted-foreground">{message}</p> : null}
      </div>
    </section>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  disabled,
  onCheckedChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} />
    </div>
  );
}
