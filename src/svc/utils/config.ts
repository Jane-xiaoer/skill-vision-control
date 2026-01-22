import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { SkillsConfig, ScheduleConfig, GlobalConfig, Skill } from '../types';

const SVC_DIR = path.join(os.homedir(), '.svc');
const SKILLS_FILE = path.join(SVC_DIR, 'skills.json');
const SCHEDULE_FILE = path.join(SVC_DIR, 'schedule.json');
const CONFIG_FILE = path.join(SVC_DIR, 'config.json');
const VERSIONS_DIR = path.join(SVC_DIR, 'versions');

export function ensureDataDir(): void {
  if (!fs.existsSync(SVC_DIR)) {
    fs.mkdirSync(SVC_DIR, { recursive: true });
  }
  if (!fs.existsSync(VERSIONS_DIR)) {
    fs.mkdirSync(VERSIONS_DIR, { recursive: true });
  }
}

export function getDataDir(): string {
  return SVC_DIR;
}

export function getVersionsDir(): string {
  return VERSIONS_DIR;
}

export function getSkillVersionsDir(skillName: string): string {
  return path.join(VERSIONS_DIR, skillName);
}

export function loadSkillsConfig(): SkillsConfig {
  ensureDataDir();
  if (!fs.existsSync(SKILLS_FILE)) {
    return { skills: {} };
  }
  const content = fs.readFileSync(SKILLS_FILE, 'utf-8');
  return JSON.parse(content);
}

export function saveSkillsConfig(config: SkillsConfig): void {
  ensureDataDir();
  fs.writeFileSync(SKILLS_FILE, JSON.stringify(config, null, 2));
}

export function loadScheduleConfig(): ScheduleConfig {
  ensureDataDir();
  if (!fs.existsSync(SCHEDULE_FILE)) {
    return {
      enabled: true,
      intervalDays: 7,
      lastRun: null,
      nextRun: null,
      notify: true
    };
  }
  const content = fs.readFileSync(SCHEDULE_FILE, 'utf-8');
  return JSON.parse(content);
}

export function saveScheduleConfig(config: ScheduleConfig): void {
  ensureDataDir();
  fs.writeFileSync(SCHEDULE_FILE, JSON.stringify(config, null, 2));
}

export function loadGlobalConfig(): GlobalConfig {
  ensureDataDir();
  if (!fs.existsSync(CONFIG_FILE)) {
    return {
      version: '1.0.0',
      dataDir: SVC_DIR,
      defaultInterval: 7
    };
  }
  const content = fs.readFileSync(CONFIG_FILE, 'utf-8');
  return JSON.parse(content);
}

export function saveGlobalConfig(config: GlobalConfig): void {
  ensureDataDir();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

// Alias for compatibility
export function getConfig(): GlobalConfig {
  return loadGlobalConfig();
}

export function saveConfig(config: GlobalConfig): void {
  saveGlobalConfig(config);
}

export function getSkill(name: string): Skill | null {
  const config = loadSkillsConfig();
  return config.skills[name] || null;
}

export function saveSkill(skill: Skill): void {
  const config = loadSkillsConfig();
  config.skills[skill.name] = skill;
  saveSkillsConfig(config);
}

export function removeSkill(name: string): boolean {
  const config = loadSkillsConfig();
  if (config.skills[name]) {
    delete config.skills[name];
    saveSkillsConfig(config);
    return true;
  }
  return false;
}

export function listSkills(): Skill[] {
  const config = loadSkillsConfig();
  return Object.values(config.skills);
}
