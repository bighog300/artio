const DISMISS_KEY = "artio:get-started-banner-dismissed";

export function isGetStartedBannerDismissed(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(DISMISS_KEY) === "1";
}

export function setGetStartedBannerDismissed(value: boolean) {
  if (typeof window === "undefined") return;
  if (value) {
    window.localStorage.setItem(DISMISS_KEY, "1");
    return;
  }
  window.localStorage.removeItem(DISMISS_KEY);
}
