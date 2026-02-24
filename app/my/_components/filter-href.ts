export type SearchParamsInput = Record<string, string | string[] | undefined>;

export const PAGINATION_KEYS = ["cursor", "page", "offset"] as const;

function appendParam(params: URLSearchParams, key: string, value: string | string[] | undefined) {
  if (typeof value === "string" && value.length > 0) {
    params.set(key, value);
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      if (entry.length > 0) params.append(key, entry);
    }
  }
}

export function toSearchParams(searchParams: SearchParamsInput): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    appendParam(params, key, value);
  }
  return params;
}

export function getFirstSearchValue(searchParams: SearchParamsInput, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = searchParams[key];
    if (typeof value === "string" && value.length > 0) return value;
    if (Array.isArray(value) && value[0]) return value[0];
  }
  return undefined;
}

function toHref(pathname: string, params: URLSearchParams): string {
  const query = params.toString();
  return query.length > 0 ? `${pathname}?${query}` : pathname;
}

export function deletePaginationParams(params: URLSearchParams): void {
  for (const key of PAGINATION_KEYS) params.delete(key);
}

export function buildRemoveFilterHref(pathname: string, searchParams: SearchParamsInput, keys: string[]): string {
  const params = toSearchParams(searchParams);
  for (const key of keys) params.delete(key);
  deletePaginationParams(params);
  return toHref(pathname, params);
}

export function buildClearFiltersHref(
  pathname: string,
  searchParams: SearchParamsInput,
  keysToClear: string[],
  preserveKeys: string[] = [],
): string {
  const current = toSearchParams(searchParams);
  const next = new URLSearchParams();
  const preserve = new Set(preserveKeys);

  for (const [key, value] of current.entries()) {
    if (preserve.has(key)) next.append(key, value);
  }

  for (const key of keysToClear) {
    if (!preserve.has(key)) next.delete(key);
  }

  deletePaginationParams(next);

  return toHref(pathname, next);
}

export function truncateFilterValue(value: string, maxLength = 24): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1)}…`;
}

export function toTitleCase(value: string): string {
  if (!value) return value;
  return value.slice(0, 1).toUpperCase() + value.slice(1).toLowerCase();
}
