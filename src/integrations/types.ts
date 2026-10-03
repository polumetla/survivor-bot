import type { Entry, EntryRecommendation } from '../core/types';

export interface ImportResult {
  entries: Entry[];
  warnings: string[];
}

export interface PlatformAdapter {
  id: string;
  name: string;
  description: string;
  /** Placeholder / example shown in the import dialog. */
  example: string;
  capabilities: {
    /** Can turn pasted text or an uploaded file into entries. */
    import: boolean;
    /** Can pull entries directly from the platform with credentials. */
    sync: boolean;
    /** Can submit picks to the platform. */
    submit: boolean;
  };
  parse(input: string): ImportResult;
  /** Text to copy back into the platform (or a spreadsheet). */
  exportPicks(recs: EntryRecommendation[]): string;
  /** Optional direct sync; only implemented where the platform offers an API. */
  sync?(credentials: Record<string, string>): Promise<ImportResult>;
}
