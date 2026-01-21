import axios from 'axios';
import { Skill, SkillSource, CheckResult } from '../types';
import { getSkill, saveSkill, listSkills } from '../utils/config';

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

export async function getLatestGitHubVersion(repo: string): Promise<string | null> {
  try {
    const response = await axios.get<GitHubRelease[]>(
      `https://api.github.com/repos/${repo}/releases`,
      {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'skill-vision-control'
        }
      }
    );
    
    if (response.data.length > 0) {
      return response.data[0].tag_name;
    }
    
    // If no releases, try tags
    const tagsResponse = await axios.get<Array<{ name: string }>>(
      `https://api.github.com/repos/${repo}/tags`,
      {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'skill-vision-control'
        }
      }
    );
    
    if (tagsResponse.data.length > 0) {
      return tagsResponse.data[0].name;
    }
    
    return null;
  } catch (error) {
    console.error(`Failed to fetch GitHub version for ${repo}:`, error);
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
  
  const hasUpdate = latestVersion !== skill.officialVersion;
  
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
