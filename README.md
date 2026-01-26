# Skill Vision Control (SVC)

[![npm version](https://badge.fury.io/js/skill-vision-control.svg)](https://badge.fury.io/js/skill-vision-control)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> **Safe MCP Skill Version Manager** - Detect updates, parallel testing, smart merge, confirm before replace

## Features

- 🔍 **Update Detection** - Automatically detect new versions from GitHub/npm
- 🛡️ **Security Scanning** - Auto scan before download (Sentinel integration)
- 📦 **Version Management** - Keep multiple versions, switch anytime
- 🔀 **Smart Merge** - Merge official updates with your custom changes
- 🧪 **A/B Testing** - Test new versions before switching
- ⏰ **Scheduled Checks** - Automatic weekly/monthly update checks
- 🔔 **Notifications** - Desktop notifications for updates
- 🤖 **MCP Server** - Let AI manage your skills

## Installation

```bash
npm install -g skill-vision-control
```

Or with yarn:

```bash
yarn global add skill-vision-control
```

## Quick Start

```bash
# Add a skill to manage
svc add weather --source github:username/weather-mcp

# Check for updates
svc check

# Download new version (keeps old version)
svc download weather

# Test and switch
svc switch weather --version v1.1.0

# Or if you have custom changes, merge them
svc merge weather
```

## Commands

### Skill Management

| Command | Description |
|---------|-------------|
| `svc add <name> --source <url>` | Register a skill (github:user/repo or npm:package) |
| `svc list` | List all managed skills |
| `svc info <name>` | Show detailed information |
| `svc remove <name>` | Remove a skill |

### Version Control

| Command | Description |
|---------|-------------|
| `svc check [name]` | Check for updates |
| `svc download <name>` | Download new version (keep old) |
| `svc versions <name>` | List all local versions |
| `svc switch <name> -v <version>` | Switch to specific version |
| `svc rollback <name>` | Rollback to previous version |
| `svc confirm <name>` | Confirm current version |
| `svc cleanup <name> --keep <n>` | Clean old versions |

### Custom Modifications

| Command | Description |
|---------|-------------|
| `svc fork <name>` | Create custom branch for modifications |
| `svc save <name> -c "comment"` | Save your modifications |
| `svc diff <name>` | View differences from official |
| `svc merge <name>` | Merge official update with your changes |
| `svc conflicts <name>` | View merge conflicts |
| `svc resolve <name> -f <file> -u <choice>` | Resolve conflicts |

### Schedule

| Command | Description |
|---------|-------------|
| `svc schedule set -i <days>` | Set check interval (1/7/14/30 days) |
| `svc schedule show` | Show current schedule |
| `svc schedule enable` | Enable scheduled checks |
| `svc schedule disable` | Disable scheduled checks |
| `svc schedule run` | Manually trigger check |

### Security Scanning

| Command | Description |
|---------|-------------|
| `svc scan <path>` | Scan any skill directory for security issues |
| `svc audit [name]` | Audit installed skill(s) |
| `svc download <name> --skip-security` | Download without security scan (not recommended) |

## Workflow Examples

### Basic Update Flow

```bash
# 1. Check for updates
svc check
# Output: weather: v1.0.0 → v1.1.0 available

# 2. Download (old version preserved)
svc download weather

# 3. Test new version
svc switch weather -v v1.1.0 -t official

# 4. If good, confirm; if not, rollback
svc confirm weather
# or
svc rollback weather
```

### Security Audit Before Install

```bash
# Scan a skill before installing
svc scan ~/Downloads/some-mcp-skill

# Output:
# 🛡️  Sentinel Security Scan Report
# ══════════════════════════════════════════════════
# Risk Level: MEDIUM
# Recommendation: REVIEW
# 
# ⚠️  SUSPICIOUS: 3 items found
#    - src/api.ts:15 - Network request (axios)
#    - src/config.ts:8 - Environment variable access

# Audit all installed skills
svc audit

# Audit specific skill with details
svc audit weather -v
```

### Custom Changes + Update

```bash
# 1. Create custom branch
svc fork weather

# 2. Make your modifications...
# 3. Save changes
svc save weather -c "Added Chinese language support"

# 4. Later, when update available
svc check
# Output: ⚠️ You have custom changes. Use "svc merge"

# 5. Download and merge
svc download weather
svc merge weather

# 6. If conflicts exist
svc conflicts weather
svc resolve weather -f src/config.ts -u custom

# 7. Test merged version
svc switch weather -v v1.1.0-merged -t merged

# 8. Confirm
svc confirm weather
```

## Using as MCP Server

Add to your MCP configuration:

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

Available MCP tools:
- `svc_list_skills` - List all managed skills
- `svc_get_skill_info` - Get skill details
- `svc_check_updates` - Check for updates
- `svc_get_versions` - Get local versions
- `svc_switch_version` - Switch version
- `svc_rollback` - Rollback to previous
- `svc_download_update` - Download new version
- `svc_merge` - Merge with custom changes
- `svc_get_conflicts` - View merge conflicts

## Data Storage

All data is stored in `~/.svc/`:

```
~/.svc/
├── skills.json      # Skill registry
├── schedule.json    # Schedule settings
├── config.json      # Global config
└── versions/        # Version storage
    └── <skill>/
        ├── official/
        ├── custom/
        ├── merged/
        └── active -> ...
```

## Security Scanning

SVC integrates [Sentinel](https://github.com/Jane-xiaoer/skill-vision-control) security patterns for automatic code scanning.

### Detection Capabilities

| Level | Description | Examples |
|-------|-------------|----------|
| **CRITICAL** | High-risk patterns | `eval()`, `exec()`, `rm -rf`, registry access |
| **SUSPICIOUS** | Needs review | Network requests, env vars, file operations |
| **WARNING** | Potential issues | Long lines, high entropy files |

### Risk Levels

| Level | Action |
|-------|--------|
| `SAFE` | Safe to install |
| `LOW` | Minor concerns, review recommended |
| `MEDIUM` | Review required before install |
| `HIGH` | Significant risks detected |
| `CRITICAL` | Do not install without careful review |

### Auto-Scan on Download

When you run `svc download`, security scan runs automatically:

```bash
svc download weather
# 🛡️  Running security scan...
# ✅ Security scan passed
# ✓ Download complete
```

If issues found:
```bash
svc download untrusted-skill
# 🛡️  Running security scan...
# 🛑 Security scan found critical issues!
# ? Do you still want to proceed? (NOT RECOMMENDED) (y/N)
```

To skip (not recommended):
```bash
svc download weather --skip-security
```

## Configuration

### Supported Sources

- **GitHub**: `github:username/repo` or `username/repo`
- **npm**: `npm:package-name`

### Schedule Options

- `1d` - Daily checks
- `7d` - Weekly checks (default)
- `14d` - Bi-weekly checks
- `30d` - Monthly checks

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - see [LICENSE](LICENSE) for details.
