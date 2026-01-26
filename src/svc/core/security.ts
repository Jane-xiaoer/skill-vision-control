/**
 * Security Scanner Module
 * Integrated security scanning before skill downloads
 * Based on Sentinel security patterns
 */

import * as fs from 'fs';
import * as path from 'path';

// Risk patterns from Sentinel
const RISK_PATTERNS = {
  CRITICAL: [
    { pattern: /rm\s+-[rf]+/g, desc: '强制删除文件 (rm -rf)' },
    { pattern: /mkfs/g, desc: '格式化磁盘' },
    { pattern: /:(){:\|:&};:/g, desc: 'Fork炸弹' },
    { pattern: /eval\(/g, desc: '动态代码执行 (eval)' },
    { pattern: /exec\(/g, desc: '动态代码执行 (exec)' },
    { pattern: /subprocess\.Popen/g, desc: '子进程命令执行' },
    { pattern: /os\.system/g, desc: '系统命令执行' },
    { pattern: /commands\.getoutput/g, desc: '系统命令执行' },
    { pattern: /base64\.b64decode/g, desc: 'Base64解码 (可能隐藏恶意载荷)' },
    { pattern: /\/etc\/shadow/g, desc: '读取密码文件' },
    { pattern: /\/etc\/passwd/g, desc: '读取用户信息' },
    { pattern: /Registry/gi, desc: 'Windows注册表操作' },
    { pattern: /winreg/g, desc: 'Windows注册表访问' },
    { pattern: /__import__\s*\(/g, desc: '动态导入模块' },
    { pattern: /importlib\./g, desc: '动态导入模块' },
    { pattern: /compile\(/g, desc: '编译代码' },
    { pattern: /\bChild_Process\b/gi, desc: 'Node.js子进程' },
    { pattern: /spawn\s*\(/g, desc: '进程创建' },
    { pattern: /execSync\s*\(/g, desc: '同步命令执行' },
  ],
  SUSPICIOUS: [
    { pattern: /requests\./g, desc: '网络请求 (Python)' },
    { pattern: /urllib/g, desc: '网络请求 (Python urllib)' },
    { pattern: /httpx\./g, desc: '网络请求 (httpx)' },
    { pattern: /aiohttp\./g, desc: '异步网络请求' },
    { pattern: /\bsocket\b/g, desc: 'Socket连接' },
    { pattern: /wget|curl/g, desc: '下载外部文件' },
    { pattern: /chkconfig|systemctl/g, desc: '系统服务修改' },
    { pattern: /iptables/g, desc: '防火墙规则修改' },
    { pattern: /openpty|pty\.fork/g, desc: '伪终端创建 (可能用于后门)' },
    { pattern: /pickle\.loads/g, desc: 'Python反序列化' },
    { pattern: /yaml\.load\(/g, desc: '不安全的YAML加载' },
    { pattern: /marshal\.loads/g, desc: '字节码加载' },
    { pattern: /os\.environ/g, desc: '环境变量访问' },
    { pattern: /fetch\s*\(/g, desc: '网络请求 (fetch)' },
    { pattern: /axios/g, desc: '网络请求 (axios)' },
    { pattern: /node-fetch/g, desc: '网络请求 (node-fetch)' },
    { pattern: /fs\.rmSync|fs\.rmdirSync/g, desc: '文件删除操作' },
    { pattern: /fs\.writeFileSync/g, desc: '文件写入操作' },
  ]
};

// Text file extensions to scan
const TEXT_EXTENSIONS = new Set([
  '.py', '.js', '.ts', '.jsx', '.tsx', '.sh', '.bash', '.zsh',
  '.md', '.txt', '.json', '.yaml', '.yml', '.toml', '.ini', '.cfg',
  '.html', '.css', '.xml', '.sql', '.rb', '.go', '.rs', '.java', '.c', '.cpp', '.h'
]);

// Directories to skip
const SKIP_DIRS = new Set([
  'node_modules', '__pycache__', '.git', 'venv', 'env', 'dist', 'build', '.venv'
]);

export interface SecurityAlert {
  level: 'CRITICAL' | 'SUSPICIOUS' | 'WARNING';
  file: string;
  line: number;
  description: string;
  pattern: string;
}

export interface SecurityScanResult {
  targetDir: string;
  scanTime: string;
  filesScanned: number;
  alerts: SecurityAlert[];
  entropyWarnings: Array<{ file: string; entropy: number }>;
  metadataIssues: string[];
  riskLevel: 'SAFE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  recommendation: 'INSTALL' | 'REVIEW' | 'REJECT';
  summary: string;
}

/**
 * Calculate Shannon entropy to detect obfuscated/encrypted code
 */
function calculateEntropy(data: string): number {
  if (!data || data.length === 0) return 0;
  
  const charCounts: Record<string, number> = {};
  for (const char of data) {
    charCounts[char] = (charCounts[char] || 0) + 1;
  }
  
  let entropy = 0;
  const len = data.length;
  
  for (const count of Object.values(charCounts)) {
    const p = count / len;
    if (p > 0) {
      entropy -= p * Math.log2(p);
    }
  }
  
  return entropy;
}

/**
 * Scan a single file for security issues
 */
function scanFile(filePath: string, relativePath: string): { alerts: SecurityAlert[]; entropy: number } {
  const alerts: SecurityAlert[] = [];
  let content: string;
  
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch {
    return { alerts: [], entropy: 0 };
  }
  
  const entropy = calculateEntropy(content);
  const lines = content.split('\n');
  
  // Check each line for patterns
  lines.forEach((line, lineIndex) => {
    // Check for long lines (potential hidden payload)
    if (line.length > 1000) {
      alerts.push({
        level: 'WARNING',
        file: relativePath,
        line: lineIndex + 1,
        description: `超长行 (${line.length}字符)，可能隐藏Payload`,
        pattern: 'line_length > 1000'
      });
    }
    
    // Check CRITICAL patterns
    for (const { pattern, desc } of RISK_PATTERNS.CRITICAL) {
      if (pattern.test(line)) {
        alerts.push({
          level: 'CRITICAL',
          file: relativePath,
          line: lineIndex + 1,
          description: desc,
          pattern: pattern.source
        });
        pattern.lastIndex = 0; // Reset regex state
      }
    }
    
    // Check SUSPICIOUS patterns
    for (const { pattern, desc } of RISK_PATTERNS.SUSPICIOUS) {
      if (pattern.test(line)) {
        alerts.push({
          level: 'SUSPICIOUS',
          file: relativePath,
          line: lineIndex + 1,
          description: desc,
          pattern: pattern.source
        });
        pattern.lastIndex = 0;
      }
    }
  });
  
  return { alerts, entropy };
}

/**
 * Check skill metadata (SKILL.md)
 */
function checkMetadata(skillDir: string): string[] {
  const issues: string[] = [];
  const skillMdPath = path.join(skillDir, 'SKILL.md');
  
  if (!fs.existsSync(skillMdPath)) {
    issues.push('缺少 SKILL.md 文件');
    return issues;
  }
  
  try {
    const content = fs.readFileSync(skillMdPath, 'utf-8');
    
    // Check frontmatter
    if (!content.startsWith('---')) {
      issues.push('SKILL.md 缺少 YAML frontmatter');
    } else {
      const frontmatterEnd = content.indexOf('---', 3);
      if (frontmatterEnd === -1) {
        issues.push('SKILL.md frontmatter 格式不正确');
      } else {
        const frontmatter = content.substring(3, frontmatterEnd);
        if (!frontmatter.includes('name:')) {
          issues.push('SKILL.md 缺少 name 字段');
        }
        if (!frontmatter.includes('description:')) {
          issues.push('SKILL.md 缺少 description 字段');
        }
      }
    }
    
    if (content.includes('[TODO:')) {
      issues.push('SKILL.md 包含未完成的 TODO 项');
    }
  } catch {
    issues.push('无法读取 SKILL.md 文件');
  }
  
  return issues;
}

/**
 * Walk directory recursively
 */
function* walkDir(dir: string, baseDir: string = dir): Generator<{ fullPath: string; relativePath: string }> {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(baseDir, fullPath);
    
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
        yield* walkDir(fullPath, baseDir);
      }
    } else if (entry.isFile() && !entry.name.startsWith('.')) {
      yield { fullPath, relativePath };
    }
  }
}

/**
 * Determine risk level based on alerts
 */
function determineRiskLevel(alerts: SecurityAlert[], entropyWarnings: number): SecurityScanResult['riskLevel'] {
  const criticalCount = alerts.filter(a => a.level === 'CRITICAL').length;
  const suspiciousCount = alerts.filter(a => a.level === 'SUSPICIOUS').length;
  const warningCount = alerts.filter(a => a.level === 'WARNING').length;
  
  if (criticalCount >= 3 || (criticalCount >= 1 && entropyWarnings >= 2)) {
    return 'CRITICAL';
  }
  if (criticalCount >= 1 || suspiciousCount >= 5) {
    return 'HIGH';
  }
  if (suspiciousCount >= 2 || entropyWarnings >= 2) {
    return 'MEDIUM';
  }
  if (suspiciousCount >= 1 || warningCount >= 3 || entropyWarnings >= 1) {
    return 'LOW';
  }
  return 'SAFE';
}

/**
 * Determine recommendation based on risk level
 */
function determineRecommendation(riskLevel: SecurityScanResult['riskLevel']): SecurityScanResult['recommendation'] {
  switch (riskLevel) {
    case 'CRITICAL':
      return 'REJECT';
    case 'HIGH':
      return 'REJECT';
    case 'MEDIUM':
      return 'REVIEW';
    case 'LOW':
      return 'REVIEW';
    case 'SAFE':
      return 'INSTALL';
  }
}

/**
 * Generate summary message
 */
function generateSummary(result: SecurityScanResult): string {
  const criticalCount = result.alerts.filter(a => a.level === 'CRITICAL').length;
  const suspiciousCount = result.alerts.filter(a => a.level === 'SUSPICIOUS').length;
  
  if (result.riskLevel === 'SAFE') {
    return '✅ 安全扫描通过，未发现已知恶意代码特征';
  }
  
  const parts: string[] = [];
  if (criticalCount > 0) {
    parts.push(`${criticalCount} 个严重风险`);
  }
  if (suspiciousCount > 0) {
    parts.push(`${suspiciousCount} 个可疑行为`);
  }
  if (result.entropyWarnings.length > 0) {
    parts.push(`${result.entropyWarnings.length} 个高熵值文件`);
  }
  
  const icon = result.riskLevel === 'CRITICAL' ? '🛑' : result.riskLevel === 'HIGH' ? '⚠️' : '⚡';
  return `${icon} 发现 ${parts.join('、')}`;
}

/**
 * Main security scan function
 */
export function scanSkillDirectory(targetDir: string): SecurityScanResult {
  const result: SecurityScanResult = {
    targetDir,
    scanTime: new Date().toISOString(),
    filesScanned: 0,
    alerts: [],
    entropyWarnings: [],
    metadataIssues: [],
    riskLevel: 'SAFE',
    recommendation: 'INSTALL',
    summary: ''
  };
  
  // Check if directory exists
  if (!fs.existsSync(targetDir) || !fs.statSync(targetDir).isDirectory()) {
    result.metadataIssues.push('目标目录不存在');
    result.riskLevel = 'CRITICAL';
    result.recommendation = 'REJECT';
    result.summary = '🛑 目标目录无效';
    return result;
  }
  
  // Check metadata
  result.metadataIssues = checkMetadata(targetDir);
  
  // Scan files
  for (const { fullPath, relativePath } of walkDir(targetDir)) {
    const ext = path.extname(fullPath).toLowerCase();
    if (!TEXT_EXTENSIONS.has(ext)) continue;
    
    result.filesScanned++;
    const { alerts, entropy } = scanFile(fullPath, relativePath);
    result.alerts.push(...alerts);
    
    // Check entropy
    if (entropy > 5.8) {
      result.entropyWarnings.push({ file: relativePath, entropy });
    }
  }
  
  // Determine risk level and recommendation
  result.riskLevel = determineRiskLevel(result.alerts, result.entropyWarnings.length);
  result.recommendation = determineRecommendation(result.riskLevel);
  result.summary = generateSummary(result);
  
  return result;
}

/**
 * Format scan result for display
 */
export function formatScanResult(result: SecurityScanResult, verbose: boolean = false): string {
  const lines: string[] = [];
  
  lines.push('');
  lines.push('🛡️  Sentinel 安全扫描报告');
  lines.push('═'.repeat(50));
  lines.push(`目标目录: ${result.targetDir}`);
  lines.push(`扫描时间: ${result.scanTime}`);
  lines.push(`扫描文件: ${result.filesScanned}`);
  lines.push('');
  
  // Metadata issues
  if (result.metadataIssues.length > 0) {
    lines.push('📋 元数据检查:');
    for (const issue of result.metadataIssues) {
      lines.push(`   ⚠️  ${issue}`);
    }
    lines.push('');
  }
  
  // Alerts by level
  const criticalAlerts = result.alerts.filter(a => a.level === 'CRITICAL');
  const suspiciousAlerts = result.alerts.filter(a => a.level === 'SUSPICIOUS');
  const warningAlerts = result.alerts.filter(a => a.level === 'WARNING');
  
  if (criticalAlerts.length > 0) {
    lines.push('🛑 严重风险 (CRITICAL):');
    for (const alert of criticalAlerts) {
      lines.push(`   ${alert.file}:${alert.line} - ${alert.description}`);
    }
    lines.push('');
  }
  
  if (suspiciousAlerts.length > 0) {
    lines.push('⚠️  可疑行为 (SUSPICIOUS):');
    const displayed = verbose ? suspiciousAlerts : suspiciousAlerts.slice(0, 10);
    for (const alert of displayed) {
      lines.push(`   ${alert.file}:${alert.line} - ${alert.description}`);
    }
    if (!verbose && suspiciousAlerts.length > 10) {
      lines.push(`   ... 还有 ${suspiciousAlerts.length - 10} 个 (使用 --verbose 查看全部)`);
    }
    lines.push('');
  }
  
  if (result.entropyWarnings.length > 0) {
    lines.push('🔐 高熵值文件警告:');
    for (const { file, entropy } of result.entropyWarnings) {
      lines.push(`   ${file} (熵值: ${entropy.toFixed(2)})`);
    }
    lines.push('');
  }
  
  // Summary
  lines.push('─'.repeat(50));
  lines.push(`风险等级: ${result.riskLevel}`);
  lines.push(`扫描结论: ${result.summary}`);
  lines.push('');
  
  // Recommendation
  switch (result.recommendation) {
    case 'INSTALL':
      lines.push('✅ 建议: 可以安全安装');
      break;
    case 'REVIEW':
      lines.push('⚡ 建议: 需要人工审查后决定');
      lines.push('   请检查以上警告是否为 Skill 功能所必需');
      break;
    case 'REJECT':
      lines.push('🛑 建议: 不建议安装');
      lines.push('   发现高危代码模式，存在安全风险');
      break;
  }
  
  lines.push('');
  return lines.join('\n');
}

/**
 * Quick check - returns true if safe to proceed
 */
export function isSkillSafe(targetDir: string): { safe: boolean; reason: string } {
  const result = scanSkillDirectory(targetDir);
  
  if (result.recommendation === 'INSTALL') {
    return { safe: true, reason: result.summary };
  }
  
  if (result.recommendation === 'REVIEW') {
    return { safe: false, reason: `需要审查: ${result.summary}` };
  }
  
  return { safe: false, reason: `安全风险: ${result.summary}` };
}
