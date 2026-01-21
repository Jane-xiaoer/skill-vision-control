import * as fs from 'fs';
import * as path from 'path';
import { MergeResult, ConflictInfo, Skill } from '../types';
import { getSkill, saveSkill, getSkillVersionsDir } from '../utils/config';
import { ensureDir, listFiles, copyDir } from '../utils/fs';

interface DiffResult {
  added: string[];
  modified: string[];
  deleted: string[];
  conflicts: string[];
}

function readFileContent(filePath: string): string {
  if (!fs.existsSync(filePath)) {
    return '';
  }
  return fs.readFileSync(filePath, 'utf-8');
}

function compareFiles(file1: string, file2: string): boolean {
  const content1 = readFileContent(file1);
  const content2 = readFileContent(file2);
  return content1 === content2;
}

function diffDirectories(baseDir: string, newDir: string, customDir: string): DiffResult {
  const result: DiffResult = {
    added: [],
    modified: [],
    deleted: [],
    conflicts: []
  };
  
  const baseFiles = new Set(listFiles(baseDir, true));
  const newFiles = new Set(listFiles(newDir, true));
  const customFiles = new Set(listFiles(customDir, true));
  
  // Files added in new version
  for (const file of newFiles) {
    if (!baseFiles.has(file)) {
      result.added.push(file);
    }
  }
  
  // Files deleted in new version
  for (const file of baseFiles) {
    if (!newFiles.has(file)) {
      result.deleted.push(file);
    }
  }
  
  // Modified files - check for conflicts
  for (const file of baseFiles) {
    if (!newFiles.has(file)) continue;
    
    const basePath = path.join(baseDir, file);
    const newPath = path.join(newDir, file);
    const customPath = path.join(customDir, file);
    
    const baseContent = readFileContent(basePath);
    const newContent = readFileContent(newPath);
    const customContent = readFileContent(customPath);
    
    const newChanged = baseContent !== newContent;
    const customChanged = baseContent !== customContent;
    
    if (newChanged && customChanged && newContent !== customContent) {
      // Both changed differently - conflict
      result.conflicts.push(file);
    } else if (newChanged) {
      result.modified.push(file);
    }
  }
  
  return result;
}

function mergeFile(
  basePath: string,
  newPath: string,
  customPath: string,
  outputPath: string
): ConflictInfo | null {
  const baseContent = readFileContent(basePath);
  const newContent = readFileContent(newPath);
  const customContent = readFileContent(customPath);
  
  // Simple line-by-line merge
  const baseLines = baseContent.split('\n');
  const newLines = newContent.split('\n');
  const customLines = customContent.split('\n');
  
  const mergedLines: string[] = [];
  let hasConflict = false;
  let conflictLine = -1;
  
  const maxLen = Math.max(baseLines.length, newLines.length, customLines.length);
  
  for (let i = 0; i < maxLen; i++) {
    const baseLine = baseLines[i] ?? '';
    const newLine = newLines[i] ?? '';
    const customLine = customLines[i] ?? '';
    
    const newChanged = baseLine !== newLine;
    const customChanged = baseLine !== customLine;
    
    if (newChanged && customChanged && newLine !== customLine) {
      // Conflict at this line
      hasConflict = true;
      conflictLine = i + 1;
      mergedLines.push(`<<<<<<< OFFICIAL (new version)`);
      mergedLines.push(newLine);
      mergedLines.push(`=======`);
      mergedLines.push(customLine);
      mergedLines.push(`>>>>>>> CUSTOM (your changes)`);
    } else if (customChanged) {
      // Keep custom change
      mergedLines.push(customLine);
    } else if (newChanged) {
      // Accept new change
      mergedLines.push(newLine);
    } else {
      // No change
      mergedLines.push(baseLine);
    }
  }
  
  ensureDir(path.dirname(outputPath));
  fs.writeFileSync(outputPath, mergedLines.join('\n'));
  
  if (hasConflict) {
    return {
      file: outputPath,
      lineNumber: conflictLine,
      officialContent: newContent,
      customContent: customContent,
      resolved: false
    };
  }
  
  return null;
}

export async function mergeVersions(skillName: string): Promise<MergeResult> {
  const skill = getSkill(skillName);
  if (!skill || !skill.pending || !skill.hasCustomChanges) {
    return {
      success: false,
      conflicts: [],
      mergedVersion: '',
      addedFiles: [],
      modifiedFiles: []
    };
  }
  
  const versionsDir = getSkillVersionsDir(skillName);
  const baseDir = path.join(versionsDir, 'official', skill.customBase || skill.officialVersion);
  const newDir = path.join(versionsDir, 'official', skill.pending.version);
  const customDir = path.join(versionsDir, 'custom', `${skill.customBase}-custom`);
  const mergedVersion = `${skill.pending.version}-merged`;
  const mergedDir = path.join(versionsDir, 'merged', mergedVersion);
  
  // Check if all directories exist
  if (!fs.existsSync(baseDir) || !fs.existsSync(newDir) || !fs.existsSync(customDir)) {
    return {
      success: false,
      conflicts: [],
      mergedVersion: '',
      addedFiles: [],
      modifiedFiles: []
    };
  }
  
  // Start with custom version as base
  copyDir(customDir, mergedDir);
  
  // Analyze differences
  const diff = diffDirectories(baseDir, newDir, customDir);
  
  const conflicts: ConflictInfo[] = [];
  
  // Copy added files from new version
  for (const file of diff.added) {
    const srcPath = path.join(newDir, file);
    const destPath = path.join(mergedDir, file);
    ensureDir(path.dirname(destPath));
    fs.copyFileSync(srcPath, destPath);
  }
  
  // Merge modified files
  for (const file of diff.modified) {
    const basePath = path.join(baseDir, file);
    const newPath = path.join(newDir, file);
    const customPath = path.join(customDir, file);
    const outputPath = path.join(mergedDir, file);
    
    const conflict = mergeFile(basePath, newPath, customPath, outputPath);
    if (conflict) {
      conflict.file = file;
      conflicts.push(conflict);
    }
  }
  
  // Handle conflict files
  for (const file of diff.conflicts) {
    const basePath = path.join(baseDir, file);
    const newPath = path.join(newDir, file);
    const customPath = path.join(customDir, file);
    const outputPath = path.join(mergedDir, file);
    
    const conflict = mergeFile(basePath, newPath, customPath, outputPath);
    if (conflict) {
      conflict.file = file;
      conflicts.push(conflict);
    }
  }
  
  // Update skill config
  skill.pending.merged = true;
  skill.pending.mergedVersion = mergedVersion;
  saveSkill(skill);
  
  return {
    success: conflicts.length === 0,
    conflicts,
    mergedVersion,
    addedFiles: diff.added,
    modifiedFiles: diff.modified
  };
}

export function getConflicts(skillName: string): ConflictInfo[] {
  const skill = getSkill(skillName);
  if (!skill || !skill.pending?.mergedVersion) {
    return [];
  }
  
  const versionsDir = getSkillVersionsDir(skillName);
  const mergedDir = path.join(versionsDir, 'merged', skill.pending.mergedVersion);
  
  const conflicts: ConflictInfo[] = [];
  const files = listFiles(mergedDir, true);
  
  for (const file of files) {
    const filePath = path.join(mergedDir, file);
    const content = readFileContent(filePath);
    
    if (content.includes('<<<<<<< OFFICIAL') && content.includes('>>>>>>> CUSTOM')) {
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('<<<<<<< OFFICIAL')) {
          conflicts.push({
            file,
            lineNumber: i + 1,
            officialContent: '',
            customContent: '',
            resolved: false
          });
        }
      }
    }
  }
  
  return conflicts;
}

export function resolveConflict(
  skillName: string,
  file: string,
  resolution: 'official' | 'custom' | 'both'
): boolean {
  const skill = getSkill(skillName);
  if (!skill || !skill.pending?.mergedVersion) {
    return false;
  }
  
  const versionsDir = getSkillVersionsDir(skillName);
  const mergedDir = path.join(versionsDir, 'merged', skill.pending.mergedVersion);
  const filePath = path.join(mergedDir, file);
  
  if (!fs.existsSync(filePath)) {
    return false;
  }
  
  let content = readFileContent(filePath);
  
  // Simple conflict resolution
  const conflictPattern = /<<<<<<< OFFICIAL[^\n]*\n([\s\S]*?)\n=======\n([\s\S]*?)\n>>>>>>> CUSTOM[^\n]*/g;
  
  content = content.replace(conflictPattern, (_, official, custom) => {
    switch (resolution) {
      case 'official':
        return official;
      case 'custom':
        return custom;
      case 'both':
        return `${official}\n${custom}`;
      default:
        return custom;
    }
  });
  
  fs.writeFileSync(filePath, content);
  return true;
}
