import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { checkAllUpdates, checkSkillUpdate } from '../core/checker';
import { getVersions, switchVersion, rollbackVersion, downloadVersion } from '../core/manager';
import { mergeVersions, getConflicts } from '../core/merger';
import { listSkills, getSkill } from '../utils/config';

const server = new Server(
  {
    name: 'skill-vision-control',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'svc_list_skills',
        description: 'List all managed MCP skills',
        inputSchema: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
      {
        name: 'svc_get_skill_info',
        description: 'Get detailed information about a specific skill',
        inputSchema: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Name of the skill',
            },
          },
          required: ['name'],
        },
      },
      {
        name: 'svc_check_updates',
        description: 'Check for available updates for skills',
        inputSchema: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Skill name (optional, checks all if not provided)',
            },
          },
          required: [],
        },
      },
      {
        name: 'svc_get_versions',
        description: 'Get all local versions of a skill',
        inputSchema: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Name of the skill',
            },
          },
          required: ['name'],
        },
      },
      {
        name: 'svc_switch_version',
        description: 'Switch to a specific version of a skill',
        inputSchema: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Name of the skill',
            },
            version: {
              type: 'string',
              description: 'Version to switch to',
            },
            type: {
              type: 'string',
              enum: ['official', 'custom', 'merged'],
              description: 'Type of version',
            },
          },
          required: ['name', 'version', 'type'],
        },
      },
      {
        name: 'svc_rollback',
        description: 'Rollback a skill to its previous version',
        inputSchema: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Name of the skill',
            },
          },
          required: ['name'],
        },
      },
      {
        name: 'svc_download_update',
        description: 'Download a new version without replacing current',
        inputSchema: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Name of the skill',
            },
          },
          required: ['name'],
        },
      },
      {
        name: 'svc_merge',
        description: 'Merge official new version with custom changes',
        inputSchema: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Name of the skill',
            },
          },
          required: ['name'],
        },
      },
      {
        name: 'svc_get_conflicts',
        description: 'Get merge conflicts for a skill',
        inputSchema: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Name of the skill',
            },
          },
          required: ['name'],
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'svc_list_skills': {
        const skills = listSkills();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(skills.map(s => ({
                name: s.name,
                activeVersion: s.activeVersion,
                activeType: s.activeType,
                hasCustomChanges: s.hasCustomChanges,
                hasPendingUpdate: !!s.pending?.version
              })), null, 2),
            },
          ],
        };
      }

      case 'svc_get_skill_info': {
        const skill = getSkill(args?.name as string);
        if (!skill) {
          return {
            content: [{ type: 'text', text: `Skill "${args?.name}" not found` }],
            isError: true,
          };
        }
        return {
          content: [{ type: 'text', text: JSON.stringify(skill, null, 2) }],
        };
      }

      case 'svc_check_updates': {
        if (args?.name) {
          const result = await checkSkillUpdate(args.name as string);
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          };
        } else {
          const results = await checkAllUpdates();
          return {
            content: [{ type: 'text', text: JSON.stringify(results, null, 2) }],
          };
        }
      }

      case 'svc_get_versions': {
        const versions = getVersions(args?.name as string);
        return {
          content: [{ type: 'text', text: JSON.stringify(versions, null, 2) }],
        };
      }

      case 'svc_switch_version': {
        const success = switchVersion(
          args?.name as string,
          args?.version as string,
          args?.type as 'official' | 'custom' | 'merged'
        );
        return {
          content: [{ 
            type: 'text', 
            text: success ? `Switched to ${args?.version}` : 'Failed to switch version' 
          }],
          isError: !success,
        };
      }

      case 'svc_rollback': {
        const success = rollbackVersion(args?.name as string);
        const skill = getSkill(args?.name as string);
        return {
          content: [{ 
            type: 'text', 
            text: success ? `Rolled back to ${skill?.activeVersion}` : 'No previous version to rollback to' 
          }],
          isError: !success,
        };
      }

      case 'svc_download_update': {
        const skill = getSkill(args?.name as string);
        if (!skill?.pending?.version) {
          return {
            content: [{ type: 'text', text: 'No pending update available' }],
            isError: true,
          };
        }
        const success = await downloadVersion(args?.name as string, skill.pending.version);
        return {
          content: [{ 
            type: 'text', 
            text: success ? `Downloaded ${skill.pending.version}` : 'Download failed' 
          }],
          isError: !success,
        };
      }

      case 'svc_merge': {
        const result = await mergeVersions(args?.name as string);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          isError: !result.success && result.conflicts.length > 0,
        };
      }

      case 'svc_get_conflicts': {
        const conflicts = getConflicts(args?.name as string);
        return {
          content: [{ type: 'text', text: JSON.stringify(conflicts, null, 2) }],
        };
      }

      default:
        return {
          content: [{ type: 'text', text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  } catch (error) {
    return {
      content: [{ type: 'text', text: `Error: ${error}` }],
      isError: true,
    };
  }
});

export async function startMCPServer(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Skill Vision Control MCP Server running on stdio');
}

// Run if this is the main module
if (require.main === module) {
  startMCPServer().catch(console.error);
}
