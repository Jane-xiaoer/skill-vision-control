import notifier from 'node-notifier';
import * as path from 'path';

export function sendNotification(title: string, message: string): void {
  notifier.notify({
    title,
    message,
    sound: true,
    wait: false,
    timeout: 10
  });
}

export function notifyUpdate(skillName: string, currentVersion: string, newVersion: string): void {
  sendNotification(
    'Skill Update Available',
    `${skillName}: ${currentVersion} → ${newVersion}\n运行 'svc check ${skillName}' 查看详情`
  );
}

export function notifyMergeComplete(skillName: string, hasConflicts: boolean): void {
  if (hasConflicts) {
    sendNotification(
      'Merge Completed with Conflicts',
      `${skillName} 合并完成，但存在冲突\n运行 'svc conflicts ${skillName}' 查看`
    );
  } else {
    sendNotification(
      'Merge Completed',
      `${skillName} 合并成功，无冲突\n运行 'svc test ${skillName} --merged' 测试`
    );
  }
}

export function notifyError(title: string, error: string): void {
  sendNotification(title, `错误: ${error}`);
}
