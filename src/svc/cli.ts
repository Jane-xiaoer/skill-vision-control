#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { 
  checkSkillUpdate, 
  checkAllUpdates, 
  parseSourceString,
  getLatestVersion
} from './core/checker';
import {
  downloadVersion,
  getVersions,
  switchVersion,
  rollbackVersion,
  createCustomVersion,
  cleanupOldVersions
} from './core/manager';
import {
  mergeVersions,
  getConflicts,
  resolveConflict
} from './core/merger';
import {
  setScheduleInterval,
  enableSchedule,
  disableSchedule,
  getScheduleStatus,
  runScheduledCheck
} from './core/scheduler';
import {
  loadSkillsConfig,
  saveSkill,
  getSkill,
  removeSkill,
  listSkills,
  ensureDataDir
} from './utils/config';
import { Skill } from './types';

const program = new Command();

program
  .name('svc')
  .description('Skill Vision Control - Safe MCP Skill version manager')
  .version('1.0.0');

// ===== Add Command =====
program
  .command('add <name>')
  .description('Register a new skill to manage')
  .requiredOption('-s, --source <source>', 'Source (github:user/repo or npm:package)')
  .action(async (name: string, options: { source: string }) => {
    const spinner = ora('Adding skill...').start();
    
    const source = parseSourceString(options.source);
    if (!source) {
      spinner.fail('Invalid source format. Use github:user/repo or npm:package');
      return;
    }
    
    const version = await getLatestVersion(source);
    if (!version) {
      spinner.fail('Could not fetch version from source');
      return;
    }
    
    const skill: Skill = {
      name,
      source,
      officialVersion: version,
      activeVersion: version,
      activeType: 'official',
      hasCustomChanges: false,
      customComments: [],
      lastChecked: new Date().toISOString(),
      createdAt: new Date().toISOString()
    };
    
    saveSkill(skill);
    
    // Download the version
    const downloaded = await downloadVersion(name, version);
    if (downloaded) {
      switchVersion(name, version, 'official');
      spinner.succeed(`Added ${chalk.green(name)} (${chalk.cyan(version)})`);
    } else {
      spinner.warn(`Added ${chalk.green(name)} but failed to download files`);
    }
  });

// ===== List Command =====
program
  .command('list')
  .alias('ls')
  .description('List all managed skills')
  .action(() => {
    const skills = listSkills();
    
    if (skills.length === 0) {
      console.log(chalk.yellow('No skills registered. Use "svc add" to add one.'));
      return;
    }
    
    console.log(chalk.bold('\nManaged Skills:\n'));
    
    for (const skill of skills) {
      const customBadge = skill.hasCustomChanges ? chalk.yellow(' [custom]') : '';
      const pendingBadge = skill.pending?.version ? chalk.blue(` → ${skill.pending.version} available`) : '';
      
      console.log(`  ${chalk.green('●')} ${chalk.bold(skill.name)}${customBadge}${pendingBadge}`);
      console.log(`    Version: ${chalk.cyan(skill.activeVersion)} (${skill.activeType})`);
      console.log(`    Source: ${skill.source.type === 'github' ? skill.source.repo : skill.source.package}`);
      console.log(`    Last checked: ${new Date(skill.lastChecked).toLocaleString()}`);
      console.log();
    }
  });

// ===== Info Command =====
program
  .command('info <name>')
  .description('Show detailed information about a skill')
  .action((name: string) => {
    const skill = getSkill(name);
    if (!skill) {
      console.log(chalk.red(`Skill "${name}" not found`));
      return;
    }
    
    console.log(chalk.bold(`\n${skill.name}\n${'─'.repeat(40)}`));
    console.log(`Source:          ${skill.source.type === 'github' ? `github:${skill.source.repo}` : `npm:${skill.source.package}`}`);
    console.log(`Official Ver:    ${skill.officialVersion}`);
    console.log(`Active Ver:      ${chalk.cyan(skill.activeVersion)} (${skill.activeType})`);
    console.log(`Custom Changes:  ${skill.hasCustomChanges ? chalk.yellow('Yes') : 'No'}`);
    
    if (skill.hasCustomChanges && skill.customComments.length > 0) {
      console.log(`\nCustom Changes:`);
      for (const change of skill.customComments) {
        console.log(`  - ${change.date}: ${change.comment}`);
      }
    }
    
    if (skill.pending) {
      console.log(`\n${chalk.blue('Pending Update:')}`);
      console.log(`  Version:    ${skill.pending.version}`);
      console.log(`  Downloaded: ${skill.pending.downloaded ? 'Yes' : 'No'}`);
      console.log(`  Merged:     ${skill.pending.merged ? 'Yes' : 'No'}`);
    }
    
    console.log(`\nLast Checked: ${new Date(skill.lastChecked).toLocaleString()}`);
    console.log(`Created:      ${new Date(skill.createdAt).toLocaleString()}`);
  });

// ===== Remove Command =====
program
  .command('remove <name>')
  .description('Remove a skill from management')
  .action(async (name: string) => {
    const skill = getSkill(name);
    if (!skill) {
      console.log(chalk.red(`Skill "${name}" not found`));
      return;
    }
    
    const { confirm } = await inquirer.prompt([{
      type: 'confirm',
      name: 'confirm',
      message: `Are you sure you want to remove "${name}"?`,
      default: false
    }]);
    
    if (confirm) {
      removeSkill(name);
      console.log(chalk.green(`Removed ${name}`));
    }
  });

// ===== Check Command =====
program
  .command('check [name]')
  .description('Check for updates')
  .action(async (name?: string) => {
    const spinner = ora('Checking for updates...').start();
    
    if (name) {
      const result = await checkSkillUpdate(name);
      spinner.stop();
      
      if (!result) {
        console.log(chalk.red(`Skill "${name}" not found`));
        return;
      }
      
      if (result.hasUpdate) {
        console.log(chalk.blue(`\n${result.skillName}: ${result.currentVersion} → ${result.latestVersion}`));
        if (result.hasCustomChanges) {
          console.log(chalk.yellow('  ⚠️  You have custom changes. Use "svc merge" to merge.'));
        }
      } else {
        console.log(chalk.green(`\n${result.skillName} is up to date (${result.currentVersion})`));
      }
    } else {
      const results = await checkAllUpdates();
      spinner.stop();
      
      const updates = results.filter(r => r.hasUpdate);
      
      if (updates.length === 0) {
        console.log(chalk.green('\nAll skills are up to date!'));
      } else {
        console.log(chalk.bold(`\n${updates.length} update(s) available:\n`));
        for (const r of updates) {
          console.log(`  ${chalk.blue('●')} ${r.skillName}: ${r.currentVersion} → ${chalk.green(r.latestVersion)}`);
          if (r.hasCustomChanges) {
            console.log(chalk.yellow('      ⚠️  Has custom changes - use "svc merge"'));
          }
        }
      }
    }
  });

// ===== Download Command =====
program
  .command('download <name>')
  .description('Download new version without replacing current')
  .action(async (name: string) => {
    const skill = getSkill(name);
    if (!skill) {
      console.log(chalk.red(`Skill "${name}" not found`));
      return;
    }
    
    if (!skill.pending?.version) {
      console.log(chalk.yellow('No pending update. Run "svc check" first.'));
      return;
    }
    
    const spinner = ora(`Downloading ${skill.pending.version}...`).start();
    const success = await downloadVersion(name, skill.pending.version);
    
    if (success) {
      spinner.succeed(`Downloaded ${chalk.green(skill.pending.version)} (old version preserved)`);
    } else {
      spinner.fail('Download failed');
    }
  });

// ===== Versions Command =====
program
  .command('versions <name>')
  .description('List all local versions of a skill')
  .action((name: string) => {
    const versions = getVersions(name);
    
    if (versions.length === 0) {
      console.log(chalk.yellow('No versions found'));
      return;
    }
    
    console.log(chalk.bold(`\nVersions for ${name}:\n`));
    
    for (const v of versions) {
      const activeMarker = v.isActive ? chalk.green(' ← active') : '';
      const typeColor = v.type === 'official' ? chalk.blue : v.type === 'custom' ? chalk.yellow : chalk.magenta;
      console.log(`  ${typeColor(`[${v.type}]`)} ${v.version}${activeMarker}`);
      console.log(`    Created: ${new Date(v.createdAt).toLocaleString()}`);
    }
  });

// ===== Switch Command =====
program
  .command('switch <name>')
  .description('Switch to a specific version')
  .requiredOption('-v, --version <version>', 'Version to switch to')
  .option('-t, --type <type>', 'Version type (official/custom/merged)', 'official')
  .action((name: string, options: { version: string; type: string }) => {
    const type = options.type as 'official' | 'custom' | 'merged';
    const success = switchVersion(name, options.version, type);
    
    if (success) {
      console.log(chalk.green(`Switched to ${options.version} (${type})`));
    } else {
      console.log(chalk.red('Version not found'));
    }
  });

// ===== Rollback Command =====
program
  .command('rollback <name>')
  .description('Rollback to previous version')
  .action((name: string) => {
    const success = rollbackVersion(name);
    
    if (success) {
      const skill = getSkill(name);
      console.log(chalk.green(`Rolled back to ${skill?.activeVersion}`));
    } else {
      console.log(chalk.red('No previous version to rollback to'));
    }
  });

// ===== Fork Command =====
program
  .command('fork <name>')
  .description('Create a custom branch for your modifications')
  .action((name: string) => {
    const success = createCustomVersion(name);
    
    if (success) {
      const skill = getSkill(name);
      console.log(chalk.green(`Created custom branch: ${skill?.activeVersion}`));
      console.log(chalk.gray('You can now modify the files and use "svc save" to record changes.'));
    } else {
      console.log(chalk.red('Failed to create custom branch'));
    }
  });

// ===== Save Command =====
program
  .command('save <name>')
  .description('Save your custom modifications')
  .requiredOption('-c, --comment <comment>', 'Description of changes')
  .action((name: string, options: { comment: string }) => {
    const skill = getSkill(name);
    if (!skill) {
      console.log(chalk.red(`Skill "${name}" not found`));
      return;
    }
    
    skill.customComments.push({
      date: new Date().toISOString().split('T')[0],
      comment: options.comment
    });
    saveSkill(skill);
    
    console.log(chalk.green(`Saved: ${options.comment}`));
  });

// ===== Merge Command =====
program
  .command('merge <name>')
  .description('Merge official new version with your custom changes')
  .action(async (name: string) => {
    const skill = getSkill(name);
    if (!skill) {
      console.log(chalk.red(`Skill "${name}" not found`));
      return;
    }
    
    if (!skill.pending?.downloaded) {
      console.log(chalk.yellow('New version not downloaded. Run "svc download" first.'));
      return;
    }
    
    const spinner = ora('Merging versions...').start();
    const result = await mergeVersions(name);
    spinner.stop();
    
    if (result.success) {
      console.log(chalk.green(`\nMerge successful! Created ${result.mergedVersion}`));
      console.log(`  Added files: ${result.addedFiles.length}`);
      console.log(`  Modified files: ${result.modifiedFiles.length}`);
      console.log(chalk.gray('\nRun "svc test --merged" to test the merged version.'));
    } else {
      console.log(chalk.yellow(`\nMerge completed with ${result.conflicts.length} conflict(s)`));
      console.log(chalk.gray('Run "svc conflicts" to view and resolve conflicts.'));
    }
  });

// ===== Conflicts Command =====
program
  .command('conflicts <name>')
  .description('View merge conflicts')
  .action((name: string) => {
    const conflicts = getConflicts(name);
    
    if (conflicts.length === 0) {
      console.log(chalk.green('No conflicts found'));
      return;
    }
    
    console.log(chalk.yellow(`\n${conflicts.length} conflict(s) found:\n`));
    
    for (let i = 0; i < conflicts.length; i++) {
      const c = conflicts[i];
      console.log(`  ${i + 1}. ${c.file} (line ${c.lineNumber})`);
    }
    
    console.log(chalk.gray('\nUse "svc resolve <name> --file <file> --use <official|custom|both>" to resolve.'));
  });

// ===== Resolve Command =====
program
  .command('resolve <name>')
  .description('Resolve a merge conflict')
  .requiredOption('-f, --file <file>', 'File with conflict')
  .requiredOption('-u, --use <choice>', 'Resolution: official, custom, or both')
  .action((name: string, options: { file: string; use: string }) => {
    const choice = options.use as 'official' | 'custom' | 'both';
    const success = resolveConflict(name, options.file, choice);
    
    if (success) {
      console.log(chalk.green(`Resolved conflict in ${options.file}`));
    } else {
      console.log(chalk.red('Failed to resolve conflict'));
    }
  });

// ===== Confirm Command =====
program
  .command('confirm <name>')
  .description('Confirm using current version as the new active version')
  .action(async (name: string) => {
    const skill = getSkill(name);
    if (!skill) {
      console.log(chalk.red(`Skill "${name}" not found`));
      return;
    }
    
    console.log(chalk.green(`Confirmed ${skill.activeVersion} as active version`));
    
    const { cleanup } = await inquirer.prompt([{
      type: 'confirm',
      name: 'cleanup',
      message: 'Clean up old versions?',
      default: false
    }]);
    
    if (cleanup) {
      const removed = cleanupOldVersions(name, 2);
      console.log(chalk.gray(`Removed ${removed} old version(s)`));
    }
  });

// ===== Cleanup Command =====
program
  .command('cleanup <name>')
  .description('Clean up old versions')
  .option('-k, --keep <count>', 'Number of versions to keep', '3')
  .action((name: string, options: { keep: string }) => {
    const removed = cleanupOldVersions(name, parseInt(options.keep));
    console.log(chalk.green(`Removed ${removed} old version(s)`));
  });

// ===== Schedule Commands =====
const schedule = program
  .command('schedule')
  .description('Manage update check schedule');

schedule
  .command('set')
  .description('Set check interval')
  .requiredOption('-i, --interval <days>', 'Interval in days (1, 7, 14, 30)')
  .action((options: { interval: string }) => {
    const days = parseInt(options.interval);
    if (![1, 7, 14, 30].includes(days)) {
      console.log(chalk.red('Interval must be 1, 7, 14, or 30 days'));
      return;
    }
    setScheduleInterval(days);
    console.log(chalk.green(`Schedule set to every ${days} day(s)`));
  });

schedule
  .command('show')
  .description('Show current schedule')
  .action(() => {
    const status = getScheduleStatus();
    console.log(chalk.bold('\nSchedule Status:\n'));
    console.log(`  Enabled:  ${status.enabled ? chalk.green('Yes') : chalk.red('No')}`);
    console.log(`  Interval: Every ${status.intervalDays} day(s)`);
    console.log(`  Last Run: ${status.lastRun ? new Date(status.lastRun).toLocaleString() : 'Never'}`);
    console.log(`  Next Run: ${status.nextRun ? new Date(status.nextRun).toLocaleString() : 'Not scheduled'}`);
  });

schedule
  .command('enable')
  .description('Enable scheduled checks')
  .action(() => {
    enableSchedule();
    console.log(chalk.green('Schedule enabled'));
  });

schedule
  .command('disable')
  .description('Disable scheduled checks')
  .action(() => {
    disableSchedule();
    console.log(chalk.yellow('Schedule disabled'));
  });

schedule
  .command('run')
  .description('Manually trigger a check')
  .action(async () => {
    await runScheduledCheck();
  });

// Initialize data directory
ensureDataDir();

// Parse arguments
program.parse();
