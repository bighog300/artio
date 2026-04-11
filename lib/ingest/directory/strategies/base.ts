export type DirectoryEntity = {
  entityUrl: string;
  entityName: string | null;
};

export type DirectoryExtractionArgs = {
  html: string;
  pageUrl: string;
  baseUrl: string;
  linkPattern?: string | null;
  sourceBaseHostname?: string;
};

export interface DirectoryExtractionStrategy {
  readonly name: string;
  extractEntities(args: DirectoryExtractionArgs): Promise<DirectoryEntity[]>;
}
