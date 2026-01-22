import axios, { AxiosError } from 'axios';
import { Skill, SkillSource, CheckResult } from '../types';
import { getSkill, saveSkill, listSkills, getConfig, saveConfig } from '../utils/config';

interface GitHubRelease {
  tag_name: string;
  published_at: string;
}

interface NpmPackageInfo {
  'dist-tags': {
    latest: string;
  };
  versions: Record<string, unknown>;
}

interface RateLimitInfo {
  remaining: number;
  resetTime: number;
}

// Rate limit tracking
let rateLimitInfo: RateLimitInfo = { remaining: 60, resetTime: 0 };

// Semver comparison
export function compareVersions(v1: string, v2: string): number {
  // Remove 'v' prefix if present
  const clean1 = v1.replace(/^v/, '');
  const clean2 = v2.replace(/^v/, '');
  
  const parts1 = clean1.split('.').map(p => parseInt(p.replace(/[^0-9]/g, '')) || 0);
  const parts2 = clean2.split('.').map(p => parseInt(p.replace(/[^0-9]/g, '')) || 0);
  
  // Pad arrays to same length
  while (parts1.length < 3) parts1.push(0);
  while (parts2.length < 3) parts2.push(0);
  
  for (let i = 0; i < 3; i++) {
    if (parts1[i] > parts2[i]) return 1;
    if (parts1[i] < parts2[i]) return -1;
  }
  return 0;
}

export function isNewerVersion(current: string, latest: string): boolean {
  return compareVersions(latest, current) > 0;
}

// Get GitHub auth token if configured
function getGitHubAuthHeaders(): Record<string, string> {
  const config = getConfig();
  const headers: Record<string, string> = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'skill-vision-control'
  };
  
  if (config.githubToken) {
    headers['Authorization'] = `token ${config.githubToken}`;
  }
  
  return headers;
}

// Handle rate limiting
async function checkRateLimit(): Promise<boolean> {
  if (rateLimitInfo.remaining <= 0) {
    const now = Date.now() / 1000;
    if (now < rateLimitInfo.resetTime) {
      const waitTime = Math.ceil(rateLimitInfo.resetTime - now);
      console.warn(`GitHub API rate limit reached. Resets in ${waitTime} seconds.`);
      return false;
    }
  }
  return true;
}

function updateRateLimitFromResponse(headers: Record<string, string>): void {
  const remaining = parseInt(headers['x-ratelimit-remaining'] || '60');
  const resetTime = parseInt(headers['x-ratelimit-reset'] || '0');
  rateLimitInfo = { remaining, resetTime };
}

export async function getLatestGitHubVersion(repo: string): Promise<string | null> {
  if (!await checkRateLimit()) {
    return null;
  }
  
  try {
    const headers = getGitHubAuthHeaders();
    const response = await axios.get<GitHubRelease[]>(
      `https://api.github.com/repos/${repo}/releases`,
      { headers }
    );
    
    updateRateLimitFromResponse(response.headers as Record<string, string>);
    
    if (response.data.length > 0) {
      return response.data[0].tag_name;
    }
    
    // If no releases, try tags
    const tagsResponse = await axios.get<Array<{ name: string }>>(
      `https://api.github.com/repos/${repo}/tags`,
      { headers }
    );
    
    updateRateLimitFromResponse(tagsResponse.headers as Record<string, string>);
    
    if (tagsResponse.data.length > 0) {
      return tagsResponse.data[0].name;
    }
    
    return null;
  } catch (error) {
    const axiosError = error as AxiosError;
    if (axiosError.response?.status === 403) {
      console.error('GitHub API rate limit exceeded. Use "svc config --github-token <token>" to increase limit.');
      rateLimitInfo.remaining = 0;
      const resetHeader = axiosError.response.headers['x-ratelimit-reset'];
      if (resetHeader) {
        rateLimitInfo.resetTime = parseInt(resetHeader as string);
      }
    } else if (axiosError.response?.status === 404) {
      console.error(`Repository ${repo} not found or is private. Use "svc config --github-token <token>" for private repos.`);
    } else {
      console.error(`Failed to fetch GitHub version for ${repo}:`, axiosError.message);
    }
    return null;
  }
}

export async function getLatestNpmVersion(packageName: string): Promise<string | null> {
  try {
    const response = await axios.get<NpmPackageInfo>(
      `https://registry.npmjs.org/${packageName}`
    );
    return response.data['dist-tags'].latest;
  } catch (error) {
    console.error(`Failed to fetch npm version for ${packageName}:`, error);
    return null;
  }
}

export async function getLatestVersion(source: SkillSource): Promise<string | null> {
  if (source.type === 'github' && source.repo) {
    return getLatestGitHubVersion(source.repo);
  } else if (source.type === 'npm' && source.package) {
    return getLatestNpmVersion(source.package);
  }
  return null;
}

export async function checkSkillUpdate(skillName: string): Promise<CheckResult | null> {
  const skill = getSkill(skillName);
  if (!skill) {
    return null;
  }
  
  const latestVersion = await getLatestVersion(skill.source);
  if (!latestVersion) {
    return null;
  }
  
  // Use semver comparison instead of string equality
  const hasUpdate = isNewerVersion(skill.officialVersion, latestVersion);
  
  // Update last checked time
  skill.lastChecked = new Date().toISOString();
  if (hasUpdate) {
    skill.pending = {
      version: latestVersion,
      downloaded: false,
      merged: false
    };
  }
  saveSkill(skill);
  
  return {
    skillName,
    currentVersion: skill.activeVersion,
    latestVersion,
    hasUpdate,
    hasCustomChanges: skill.hasCustomChanges
  };
}

export async function checkAllUpdates(): Promise<CheckResult[]> {
  const skills = listSkills();
  const results: CheckResult[] = [];
  
  for (const skill of skills) {
    const result = await checkSkillUpdate(skill.name);
    if (result) {
      results.push(result);
    }
  }
  
  return results;
}

export function parseSourceString(sourceStr: string): SkillSource | null {
  // Format: github:username/repo or npm:package-name
  if (sourceStr.startsWith('github:')) {
    const repo = sourceStr.slice(7);
    if (repo.includes('/')) {
      return {
        type: 'github',
        repo,
        branch: 'main'
      };
    }
  } else if (sourceStr.startsWith('npm:')) {
    const packageName = sourceStr.slice(4);
    return {
      type: 'npm',
      package: packageName
    };
  }
  
  // Try to detect format
  if (sourceStr.includes('/') && !sourceStr.includes(':')) {
    return {
      type: 'github',
      repo: sourceStr,
      branch: 'main'
    };
  }
  
  return null;
}
