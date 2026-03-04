import { track } from "@/lib/analytics/client";
import { addFeedback, itemKey, prependUniqueValue, prependUniqueValues, type PreferenceEntityType } from "@/lib/personalization/preferences";
import { applyTasteUpdate, loadTasteModel, saveTasteModel, type TasteFeedbackType, type TasteModel } from "@/lib/personalization/taste";
import { RANKING_VERSION } from "@/lib/personalization/ranking";

type FeedbackItem = {
  type: PreferenceEntityType;
  idOrSlug: string;
  tags?: string[];
  venueSlug?: string | null;
  artistSlugs?: string[];
};

export function recordFeedback({ type, item, source }: { type: TasteFeedbackType; item: FeedbackItem; source: string }): TasteModel {
  const model = loadTasteModel();
  const updated = applyTasteUpdate(model, {
    type,
    tags: item.tags,
    venueSlug: item.venueSlug,
    artistSlugs: item.artistSlugs,
    followedType: item.type === "artist" || item.type === "venue" ? item.type : undefined,
    followedSlug: item.type !== "event" ? item.idOrSlug : undefined,
  });
  saveTasteModel(updated);

  if (type === "hide") {
    prependUniqueValue("hiddenItems", itemKey({ type: item.type, idOrSlug: item.idOrSlug }));
    addFeedback("hide", { type: item.type, idOrSlug: item.idOrSlug });
  }

  if (type === "show_less") {
    if (item.type === "artist") prependUniqueValue("downrankArtists", item.idOrSlug);
    if (item.type === "venue") prependUniqueValue("downrankVenues", item.idOrSlug);
    if (item.tags?.length) prependUniqueValues("downrankTags", item.tags);
    prependUniqueValue("hiddenItems", itemKey({ type: item.type, idOrSlug: item.idOrSlug }));
    addFeedback("show_less", { type: item.type, idOrSlug: item.idOrSlug });
  }

  if (type === "click" || type === "save" || type === "attend" || type === "follow") {
    addFeedback(type, { type: item.type, idOrSlug: item.idOrSlug });
  }

  track("personalization_model_updated", { source, version: RANKING_VERSION, kind: type });
  return updated;
}
