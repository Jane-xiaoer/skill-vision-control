import * as cron from 'node-cron';
import { loadScheduleConfig, saveScheduleConfig } from '../utils/config';
import { checkAllUpdates } from './checker';
import { sendNotification } from './notifier';

let scheduledTask: cron.ScheduledTask | null = null;

function intervalToCron(days: number): string {
  // Run at 10:00 AM every N days
  if (days === 1) {
    return '0 10 * * *'; // Every day at 10:00
  } else if (days === 7) {
    return '0 10 * * 0'; // Every Sunday at 10:00
  } else if (days === 14) {
    return '0 10 1,15 * *'; // 1st and 15th of each month at 10:00
  } else if (days === 30) {
    return '0 10 1 * *'; // 1st of each month at 10:00
  }
  return '0 10 * * 0'; // Default: weekly
}

export async function runScheduledCheck(): Promise<void> {
  const config = loadScheduleConfig();
  
  console.log('Running scheduled update check...');
  const results = await checkAllUpdates();
  
  const updates = results.filter(r => r.hasUpdate);
  
  if (updates.length > 0 && config.notify) {
    const message = updates.map(u => 
      `${u.skillName}: ${u.currentVersion} → ${u.latestVersion}${u.hasCustomChanges ? ' (有自定义修改)' : ''}`
    ).join('\n');
    
    sendNotification(
      'Skill Vision Control',
      `发现 ${updates.length} 个更新:\n${message}`
    );
  }
  
  // Update last run time
  config.lastRun = new Date().toISOString();
  config.nextRun = new Date(Date.now() + config.intervalDays * 24 * 60 * 60 * 1000).toISOString();
  saveScheduleConfig(config);
}

export function startScheduler(): void {
  const config = loadScheduleConfig();
  
  if (!config.enabled) {
    console.log('Scheduler is disabled');
    return;
  }
  
  const cronExpression = intervalToCron(config.intervalDays);
  
  if (scheduledTask) {
    scheduledTask.stop();
  }
  
  scheduledTask = cron.schedule(cronExpression, async () => {
    await runScheduledCheck();
  });
  
  console.log(`Scheduler started: checking every ${config.intervalDays} days`);
}

export function stopScheduler(): void {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
    console.log('Scheduler stopped');
  }
}

export function setScheduleInterval(days: number): void {
  const config = loadScheduleConfig();
  config.intervalDays = days;
  config.nextRun = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  saveScheduleConfig(config);
  
  // Restart scheduler with new interval
  if (config.enabled) {
    startScheduler();
  }
}

export function enableSchedule(): void {
  const config = loadScheduleConfig();
  config.enabled = true;
  saveScheduleConfig(config);
  startScheduler();
}

export function disableSchedule(): void {
  const config = loadScheduleConfig();
  config.enabled = false;
  saveScheduleConfig(config);
  stopScheduler();
}

export function getScheduleStatus(): {
  enabled: boolean;
  intervalDays: number;
  lastRun: string | null;
  nextRun: string | null;
} {
  const config = loadScheduleConfig();
  return {
    enabled: config.enabled,
    intervalDays: config.intervalDays,
    lastRun: config.lastRun,
    nextRun: config.nextRun
  };
}
