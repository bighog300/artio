declare module '@playwright/test' {
  export const devices: Record<string, Record<string, unknown>>;
  export function defineConfig(config: Record<string, unknown>): Record<string, unknown>;

  export type Browser = {
    newContext: () => Promise<BrowserContext>;
  };

  export type BrowserContext = {
    addCookies: (cookies: Array<Record<string, unknown>>) => Promise<void>;
    newPage: () => Promise<Page>;
    close: () => Promise<void>;
  };

  export type Page = {
    context: () => BrowserContext;
  };

  export const test: {
    extend: <T>(fixtures: Record<string, unknown>) => unknown;
  };
}
