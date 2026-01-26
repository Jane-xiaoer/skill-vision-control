export interface SkillSource {
  type: 'github' | 'npm';
  repo?: string;
  branch?: string;
  package?: string;
}

export interface CustomChange {
  date: string;
  comment: string;
}

export interface PendingVersion {
  version: string;
  downloaded: boolean;
  merged: boolean;
  mergedVersion?: string;
}

export interface Skill {
  name: string;
  source: SkillSource;
  officialVersion: string;
  activeVersion: string;
  activeType: 'official' | 'custom' | 'merged';
  hasCustomChanges: boolean;
  customBase?: string;
  customComments: CustomChange[];
  pending?: PendingVersion;
  lastChecked: string;
  createdAt: string;
}

export interface SkillsConfig {
  skills: Record<string, Skill>;
}

export interface ScheduleConfig {
  enabled: boolean;
  intervalDays: number;
  lastRun: string | null;
  nextRun: string | null;
  notify: boolean;
}

export interface GlobalConfig {
  version: string;
  dataDir: string;
  defaultInterval: number;
  githubToken?: string;
  cacheDays?: number;  // Days to cache version info (default: 7, max: 30)
}

export interface VersionInfo {
  version: string;
  type: 'official' | 'custom' | 'merged';
  path: string;
  createdAt: string;
  isActive: boolean;
}

export interface CheckResult {
  skillName: string;
  currentVersion: string;
  latestVersion: string;
  hasUpdate: boolean;
  hasCustomChanges: boolean;
}

export interface MergeResult {
  success: boolean;
  conflicts: ConflictInfo[];
  mergedVersion: string;
  addedFiles: string[];
  modifiedFiles: string[];
}

export interface ConflictInfo {
  file: string;
  lineNumber: number;
  officialContent: string;
  customContent: string;
  resolved: boolean;
  resolution?: 'official' | 'custom' | 'both' | 'manual';
}

export interface TestSession {
  skillName: string;
  version: string;
  type: 'official' | 'custom' | 'merged';
  startedAt: string;
  status: 'running' | 'completed' | 'failed';
}

export interface SecurityScanConfig {
  enabled: boolean;
  autoReject: boolean;  // Auto reject CRITICAL risk
  allowedPatterns: string[];  // Patterns to whitelist
}

export interface DownloadOptions {
  skipSecurity?: boolean;
  force?: boolean;
  verbose?: boolean;
}
