export const INGEST_ERROR_CODES = [
  "INVALID_URL",
  "UNSAFE_URL",
  "DNS_PRIVATE_IP",
  "FETCH_TIMEOUT",
  "FETCH_TOO_LARGE",
  "FETCH_FAILED",
  "UNSUPPORTED_CONTENT_TYPE",
  "BAD_MODEL_OUTPUT",
] as const;

export type IngestErrorCode = (typeof INGEST_ERROR_CODES)[number];

export class IngestError extends Error {
  code: IngestErrorCode;
  meta?: Record<string, unknown>;

  constructor(code: IngestErrorCode, message: string, meta?: Record<string, unknown>) {
    super(message);
    this.name = "IngestError";
    this.code = code;
    this.meta = meta;
  }
}
