import * as path from 'path';
import simpleGit, { SimpleGit } from 'simple-git';
import axios from 'axios';
import * as tar from 'tar';
import * as fs from 'fs';
import { Skill, VersionInfo } from '../types';
import { getSkill, saveSkill, getSkillVersionsDir } from '../utils/config';
import { ensureDir, copyDir, removeDir, listDirs, createSymlink, getSymlinkTarget } from '../utils/fs';

const git: SimpleGit = simpleGit();

export async function downloadGitHubVersion(
  repo: string,
  version: string,
  destPath: string
): Promise<boolean> {
  try {
    ensureDir(destPath);
    
    // Clone specific tag/version
    await git.clone(
      `https://github.com/${repo}.git`,
      destPath,
      ['--branch', version, '--depth', '1']
    );
    
    // Remove .git directory to save space
    removeDir(path.join(destPath, '.git'));
    
    return true;
  } catch (error) {
    console.error(`Failed to download from GitHub:`, error);
    return false;
  }
}

export async function downloadNpmVersion(
  packageName: string,
  version: string,
  destPath: string
): Promise<boolean> {
  try {
    ensureDir(destPath);
    
    // Get tarball URL
    const response = await axios.get(`https://registry.npmjs.org/${packageName}/${version}`);
    const tarballUrl = response.data.dist.tarball;
    
    // Download and extract
    const tarballResponse = await axios.get(tarballUrl, { responseType: 'stream' });
    
    await new Promise<void>((resolve, reject) => {
      tarballResponse.data
        .pipe(tar.x({ cwd: destPath, strip: 1 }))
        .on('finish', resolve)
        .on('error', reject);
    });
    
    return true;
  } catch (error) {
    console.error(`Failed to download from npm:`, error);
    return false;
  }
}

export async function downloadVersion(skillName: string, version: string): Promise<boolean> {
  const skill = getSkill(skillName);
  if (!skill) {
    return false;
  }
  
  const versionsDir = getSkillVersionsDir(skillName);
  const officialDir = path.join(versionsDir, 'official', version);
  
  if (fs.existsSync(officialDir)) {
    console.log(`Version ${version} already exists`);
    return true;
  }
  
  let success = false;
  
  if (skill.source.type === 'github' && skill.source.repo) {
    success = await downloadGitHubVersion(skill.source.repo, version, officialDir);
  } else if (skill.source.type === 'npm' && skill.source.package) {
    success = await downloadNpmVersion(skill.source.package, version, officialDir);
  }
  
  if (success && skill.pending) {
    skill.pending.downloaded = true;
    saveSkill(skill);
  }
  
  return success;
}

export function getVersions(skillName: string): VersionInfo[] {
  const versionsDir = getSkillVersionsDir(skillName);
  const versions: VersionInfo[] = [];
  const activeLink = path.join(versionsDir, 'active');
  const activeTarget = getSymlinkTarget(activeLink);
  
  // Official versions
  const officialDir = path.join(versionsDir, 'official');
  for (const ver of listDirs(officialDir)) {
    const verPath = path.join(officialDir, ver);
    const stat = fs.statSync(verPath);
    versions.push({
      version: ver,
      type: 'official',
      path: verPath,
      createdAt: stat.birthtime.toISOString(),
      isActive: activeTarget === verPath
    });
  }
  
  // Custom versions
  const customDir = path.join(versionsDir, 'custom');
  for (const ver of listDirs(customDir)) {
    const verPath = path.join(customDir, ver);
    const stat = fs.statSync(verPath);
    versions.push({
      version: ver,
      type: 'custom',
      path: verPath,
      createdAt: stat.birthtime.toISOString(),
      isActive: activeTarget === verPath
    });
  }
  
  // Merged versions
  const mergedDir = path.join(versionsDir, 'merged');
  for (const ver of listDirs(mergedDir)) {
    const verPath = path.join(mergedDir, ver);
    const stat = fs.statSync(verPath);
    versions.push({
      version: ver,
      type: 'merged',
      path: verPath,
      createdAt: stat.birthtime.toISOString(),
      isActive: activeTarget === verPath
    });
  }
  
  return versions.sort((a, b) => 
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export function switchVersion(skillName: string, version: string, type: 'official' | 'custom' | 'merged'): boolean {
  const versionsDir = getSkillVersionsDir(skillName);
  const targetDir = path.join(versionsDir, type, version);
  
  if (!fs.existsSync(targetDir)) {
    return false;
  }
  
  const activeLink = path.join(versionsDir, 'active');
  createSymlink(targetDir, activeLink);
  
  // Update skill config
  const skill = getSkill(skillName);
  if (skill) {
    skill.activeVersion = version;
    skill.activeType = type;
    saveSkill(skill);
  }
  
  return true;
}

export function rollbackVersion(skillName: string): boolean {
  const versions = getVersions(skillName);
  const activeIndex = versions.findIndex(v => v.isActive);
  
  if (activeIndex === -1 || activeIndex >= versions.length - 1) {
    return false;
  }
  
  const previousVersion = versions[activeIndex + 1];
  return switchVersion(skillName, previousVersion.version, previousVersion.type);
}

export function createCustomVersion(skillName: string): boolean {
  const skill = getSkill(skillName);
  if (!skill) {
    return false;
  }
  
  const versionsDir = getSkillVersionsDir(skillName);
  const officialDir = path.join(versionsDir, 'official', skill.officialVersion);
  const customVersion = `${skill.officialVersion}-custom`;
  const customDir = path.join(versionsDir, 'custom', customVersion);
  
  if (!fs.existsSync(officialDir)) {
    return false;
  }
  
  copyDir(officialDir, customDir);
  
  skill.hasCustomChanges = true;
  skill.customBase = skill.officialVersion;
  skill.activeVersion = customVersion;
  skill.activeType = 'custom';
  saveSkill(skill);
  
  switchVersion(skillName, customVersion, 'custom');
  
  return true;
}

export function cleanupOldVersions(skillName: string, keepCount: number = 3): number {
  const versions = getVersions(skillName);
  const activeVersion = versions.find(v => v.isActive);
  
  // Group by type and keep only the specified count
  const toRemove: VersionInfo[] = [];
  const byType: Record<string, VersionInfo[]> = { official: [], custom: [], merged: [] };
  
  for (const v of versions) {
    byType[v.type].push(v);
  }
  
  for (const type of ['official', 'custom', 'merged'] as const) {
    const typeVersions = byType[type];
    if (typeVersions.length > keepCount) {
      const excess = typeVersions.slice(keepCount);
      toRemove.push(...excess.filter(v => !v.isActive));
    }
  }
  
  for (const v of toRemove) {
    removeDir(v.path);
  }
  
  return toRemove.length;
}
