// src/mcp-server.ts
// The MCP server — exposes WhyCode tools to any MCP-compatible agent
// Run with: node dist/mcp-server.js or tsx src/mcp-server.ts

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import {
  addDecision,
  deprecateDecision,
  formatDecisionsForAgent,
  getDecisionsForFile,
  queryDecisions,
  updateDecision,
} from './store.js';

const PROJECT_ROOT = process.env.WHYCODE_PROJECT_ROOT ?? process.cwd();

const server = new Server(
  { name: 'whycode', version: '0.1.0' },
  { capabilities: { tools: {} } }
);

// ─── List Tools ───────────────────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'whycode_get_decisions',
      description:
        'Get all WhyCode decision anchors for a file BEFORE editing it. ' +
        'Always call this before modifying any file to understand intentional decisions.',
      inputSchema: {
        type: 'object',
        properties: {
          file: { type: 'string', description: 'Relative path to the file, e.g. src/auth/token.ts' },
        },
        required: ['file'],
      },
    },
    {
      name: 'whycode_add_decision',
      description:
        'Record a decision you just made about code. Call this when you make a non-obvious ' +
        'choice that future agents or developers should understand.',
      inputSchema: {
        type: 'object',
        properties: {
          file: { type: 'string', description: 'Relative file path' },
          lines: { type: 'string', description: 'Line or range, e.g. "47" or "45-52"' },
          why: { type: 'string', description: 'Why this code is written this way' },
          alternatives_rejected: {
            type: 'array',
            items: { type: 'string' },
            description: 'Other approaches that were considered and rejected',
          },
          revisit_when: {
            type: 'string',
            description: 'Condition under which this decision should be revisited',
          },
        },
        required: ['file', 'lines', 'why'],
      },
    },
    {
      name: 'whycode_query_decisions',
      description:
        'Search all decisions by keyword or concept. Useful when starting work on a feature ' +
        'to understand existing architectural choices.',
      inputSchema: {
        type: 'object',
        properties: {
          question: { type: 'string', description: 'What you want to know, e.g. "why did we choose polling?"' },
        },
        required: ['question'],
      },
    },
    {
      name: 'whycode_update_decision',
      description: 'Update an existing decision when context changes.',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Decision ID from get_decisions output' },
          why: { type: 'string', description: 'Updated explanation' },
          revisit_when: { type: 'string' },
        },
        required: ['id', 'why'],
      },
    },
    {
      name: 'whycode_deprecate_decision',
      description:
        'Mark a decision as no longer relevant. Call this when you change code that ' +
        'previously had a WhyCode anchor and the reason no longer applies.',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Decision ID' },
          reason: { type: 'string', description: 'Why this decision is no longer relevant' },
        },
        required: ['id', 'reason'],
      },
    },
  ],
}));

// ─── Handle Tool Calls ────────────────────────────────────────────────────────

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'whycode_get_decisions': {
        const decisions = getDecisionsForFile(PROJECT_ROOT, args.file as string);
        return {
          content: [{
            type: 'text',
            text: formatDecisionsForAgent(decisions),
          }],
        };
      }

      case 'whycode_add_decision': {
        const decision = addDecision(PROJECT_ROOT, {
          file: args.file as string,
          lines: args.lines as string,
          why: args.why as string,
          alternatives_rejected: args.alternatives_rejected as string[] | undefined,
          revisit_when: args.revisit_when as string | undefined,
          added_by: 'agent',
        });
        return {
          content: [{
            type: 'text',
            text: `✅ Decision recorded [${decision.id}]: ${decision.why.slice(0, 80)}...`,
          }],
        };
      }

      case 'whycode_query_decisions': {
        const results = queryDecisions(PROJECT_ROOT, args.question as string);
        return {
          content: [{
            type: 'text',
            text: results.length > 0
              ? formatDecisionsForAgent(results)
              : 'No matching decisions found.',
          }],
        };
      }

      case 'whycode_update_decision': {
        const updated = updateDecision(PROJECT_ROOT, args.id as string, {
          why: args.why as string,
          revisit_when: args.revisit_when as string | undefined,
        });
        return {
          content: [{
            type: 'text',
            text: updated
              ? `✅ Decision [${updated.id}] updated.`
              : `❌ Decision [${args.id}] not found.`,
          }],
        };
      }

      case 'whycode_deprecate_decision': {
        const deprecated = deprecateDecision(
          PROJECT_ROOT,
          args.id as string,
          args.reason as string
        );
        return {
          content: [{
            type: 'text',
            text: deprecated
              ? `✅ Decision [${deprecated.id}] deprecated: ${args.reason}`
              : `❌ Decision [${args.id}] not found.`,
          }],
        };
      }

      default:
        return { content: [{ type: 'text', text: `Unknown tool: ${name}` }] };
    }
  } catch (err) {
    return {
      content: [{ type: 'text', text: `Error: ${(err as Error).message}` }],
      isError: true,
    };
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[WhyCode MCP] Server running. Project root:', PROJECT_ROOT);
}

main().catch(console.error);
