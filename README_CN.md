# Skill Vision Control (SVC)

[![npm version](https://badge.fury.io/js/skill-vision-control.svg)](https://badge.fury.io/js/skill-vision-control)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> **安全的 MCP Skill 版本管理器** - 检测更新、并行测试、智能合并、确认后替换

## 功能特点

- 🔍 **更新检测** - 自动检测 GitHub/npm 上的新版本
- 📦 **版本管理** - 保留多个版本，随时切换
- 🔀 **智能合并** - 将官方更新与你的自定义修改合并
- 🧪 **A/B 测试** - 切换前先测试新版本
- ⏰ **定时检查** - 自动每周/每月检查更新
- 🔔 **桌面通知** - 有更新时发送通知
- 🤖 **MCP Server** - 让 AI 帮你管理 Skills

## 安装

```bash
npm install -g skill-vision-control
```

或使用 yarn：

```bash
yarn global add skill-vision-control
```

## 快速开始

```bash
# 添加一个 Skill 进行管理
svc add weather --source github:username/weather-mcp

# 检查更新
svc check

# 下载新版本（保留旧版本）
svc download weather

# 测试并切换
svc switch weather --version v1.1.0

# 或者如果你有自定义修改，进行合并
svc merge weather
```

## 命令列表

### Skill 管理

| 命令 | 说明 |
|------|------|
| `svc add <name> --source <url>` | 注册一个 Skill（github:用户/仓库 或 npm:包名） |
| `svc list` | 列出所有管理的 Skills |
| `svc info <name>` | 显示详细信息 |
| `svc remove <name>` | 移除一个 Skill |

### 版本控制

| 命令 | 说明 |
|------|------|
| `svc check [name]` | 检查更新 |
| `svc download <name>` | 下载新版本（保留旧版本） |
| `svc versions <name>` | 列出所有本地版本 |
| `svc switch <name> -v <version>` | 切换到指定版本 |
| `svc rollback <name>` | 回滚到上一个版本 |
| `svc confirm <name>` | 确认当前版本 |
| `svc cleanup <name> --keep <n>` | 清理旧版本 |

### 自定义修改

| 命令 | 说明 |
|------|------|
| `svc fork <name>` | 创建自定义分支进行修改 |
| `svc save <name> -c "说明"` | 保存你的修改 |
| `svc diff <name>` | 查看与官方的差异 |
| `svc merge <name>` | 将官方更新与你的修改合并 |
| `svc conflicts <name>` | 查看合并冲突 |
| `svc resolve <name> -f <文件> -u <选择>` | 解决冲突 |

### 定时调度

| 命令 | 说明 |
|------|------|
| `svc schedule set -i <天数>` | 设置检查周期（1/7/14/30 天） |
| `svc schedule show` | 显示当前调度设置 |
| `svc schedule enable` | 启用定时检查 |
| `svc schedule disable` | 禁用定时检查 |
| `svc schedule run` | 手动触发检查 |

## 使用流程示例

### 基本更新流程

```bash
# 1. 检查更新
svc check
# 输出: weather: v1.0.0 → v1.1.0 可用

# 2. 下载（旧版本保留）
svc download weather

# 3. 测试新版本
svc switch weather -v v1.1.0 -t official

# 4. 如果好用就确认；不好用就回滚
svc confirm weather
# 或者
svc rollback weather
```

### 有自定义修改时更新

```bash
# 1. 创建自定义分支
svc fork weather

# 2. 进行你的修改...
# 3. 保存修改
svc save weather -c "添加了中文支持"

# 4. 之后，当有更新时
svc check
# 输出: ⚠️ 你有自定义修改，建议使用 merge 命令

# 5. 下载并合并
svc download weather
svc merge weather

# 6. 如果有冲突
svc conflicts weather
svc resolve weather -f src/config.ts -u custom

# 7. 测试合并后的版本
svc switch weather -v v1.1.0-merged -t merged

# 8. 确认使用
svc confirm weather
```

## 作为 MCP Server 使用

添加到你的 MCP 配置：

```json
{
  "mcpServers": {
    "skill-vision-control": {
      "command": "svc",
      "args": ["serve"]
    }
  }
}
```

可用的 MCP 工具：
- `svc_list_skills` - 列出所有管理的 Skills
- `svc_get_skill_info` - 获取 Skill 详情
- `svc_check_updates` - 检查更新
- `svc_get_versions` - 获取本地版本
- `svc_switch_version` - 切换版本
- `svc_rollback` - 回滚到上一个版本
- `svc_download_update` - 下载新版本
- `svc_merge` - 与自定义修改合并
- `svc_get_conflicts` - 查看合并冲突

## 数据存储

所有数据存储在 `~/.svc/`：

```
~/.svc/
├── skills.json      # Skill 注册信息
├── schedule.json    # 调度设置
├── config.json      # 全局配置
└── versions/        # 版本存储
    └── <skill名称>/
        ├── official/   # 官方版本
        ├── custom/     # 自定义版本
        ├── merged/     # 合并版本
        └── active -> ... # 当前激活版本
```

## 配置说明

### 支持的源

- **GitHub**: `github:用户名/仓库名` 或直接 `用户名/仓库名`
- **npm**: `npm:包名`

### 调度选项

- `1d` - 每天检查
- `7d` - 每周检查（默认）
- `14d` - 每两周检查
- `30d` - 每月检查

## 贡献

欢迎贡献代码！请随时提交 Pull Request。

## 许可证

MIT License - 详见 [LICENSE](LICENSE)
