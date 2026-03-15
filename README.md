# WhyCode

**Architectural memory for AI agents.** WhyCode captures the *why* behind your code so AI assistants never accidentally break decisions you fought hard to get right.

[![npm version](https://img.shields.io/npm/v/whycode.svg)](https://www.npmjs.com/package/whycode)
[![license](https://img.shields.io/npm/l/whycode.svg)](./LICENSE)
[![CI](https://github.com/whycode-dev/whycode/actions/workflows/ci.yml/badge.svg)](https://github.com/whycode-dev/whycode/actions/workflows/ci.yml)
[![MCP Compatible](https://img.shields.io/badge/MCP-compatible-blue)](https://modelcontextprotocol.io)

---

## The Problem

AI agents are getting better at writing code — but they have no memory. They see a `setTimeout(fn, 2000)` cap and think "I should remove that arbitrary limit." They don't know it was added after a P1 incident that brought down your payment service for 4 hours.

Without context, every agent is flying blind.

## The Solution

WhyCode is a local-first decision database that lives alongside your code. It stores architectural constraints, security requirements, and incident learnings in a format AI agents can query before making changes.

**One benchmark tells the story:**

| | Without WhyCode | With WhyCode |
|---|---|---|
| Constraints respected | 0 / 3 | 3 / 3 |
| Security vulnerability introduced | YES (SSRF) | NO |
| Memory crash risk | YES (OOM) | NO |
| Estimated value | -$100,000 | +$100,000 |

Both agents were equally capable. The only difference was context.

---

## Install

```bash
# As a project dev dependency (recommended)
npm install --save-dev whycode

# Or globally
npm install -g whycode
```

## Quick Start

```bash
# Initialize in your repo
npx whycode init

# Record your first decision
npx whycode capture

# View all decisions
npx whycode list

# Open the visual dashboard
npx whycode dashboard

# Check a file before editing
npx whycode check src/payments/processor.ts

# Search by keyword
npx whycode search "rate limiting"
```

---

## AI Agent Integration (MCP)

WhyCode ships a [Model Context Protocol](https://modelcontextprotocol.io) server that gives your AI assistant direct access to your decision database.

### Claude Code

```bash
claude mcp add whycode -- npx -y whycode-mcp
```

### Claude Desktop / Cursor / Windsurf

Add to your MCP configuration:

```json
{
  "mcpServers": {
    "whycode": {
      "command": "npx",
      "args": ["-y", "whycode-mcp"]
    }
  }
}
```

### What the agent can do

| Tool | When an agent uses it |
|---|---|
| `whycode_get_by_path` | Before editing a file — surfaces all decisions anchored to it |
| `whycode_check_change` | Before a refactor — risk assessment + constraint warnings |
| `whycode_search` | When looking for relevant prior decisions |
| `whycode_record` | After making a decision — saves it with full context |
| `whycode_get_by_symbol` | Before modifying a function or class |
| `whycode_capture_conversation` | Extracts decisions from chat history automatically |

---

## Visual Dashboard

Run `npx whycode dashboard` to open a local web interface showing:

- All decisions with full context, constraints, and rationale
- Metrics: coverage heatmap, constraint density, agent check history
- Search and filter by type, status, tag, or file path
- Timeline of decisions and recent agent checks

---

## CLI Reference

```
whycode init              Initialize WhyCode in the current repository
whycode capture           Interactive wizard to record a decision
whycode list              List all decisions (with filtering)
whycode check <path>      Show decisions anchored to a file
whycode search <query>    Full-text search across all decisions
whycode review            Step through decisions that may need updating
whycode heatmap           Show which files have the most coverage
whycode metrics           Print coverage and constraint statistics
whycode hooks install     Add a post-commit git hook reminder
whycode dashboard         Open the visual decision dashboard
```

---

## What a Decision Record Looks Like

```json
{
  "title": "Redis-Based Distributed Rate Limiting",
  "decisionType": "security",
  "confidence": "definitive",
  "summary": "Rate limiting must use Redis, not in-memory counters",
  "context": "Multi-instance deployment on 3 pods behind a load balancer",
  "decision": "Use Redis INCR with TTL for all rate limit counters",
  "rationale": "In-memory counters are per-instance. A user can bypass rate limits by hitting different pods.",
  "constraints": [
    {
      "severity": "must",
      "description": "Never use Map or in-memory storage for rate limit counters",
      "rationale": "Bypassed by load balancer — PCI compliance violation"
    }
  ],
  "doNotChange": ["rateLimiter\\.redisClient"],
  "agentHints": [
    {
      "instruction": "If you see in-memory rate limiting, replace with Redis INCR — do not optimize away the Redis call",
      "scope": "file"
    }
  ]
}
```

---

## Why Not Just Comments?

| | Code Comments | ADR Markdown Files | WhyCode |
|---|---|---|---|
| AI agents can query | No | No | **Yes** |
| Constraint enforcement | No | No | **Yes (risk assessment)** |
| Full-text search | No | Limited | **Yes (FTS5)** |
| Links to specific code | No | Manual | **Yes (code anchors)** |
| Staleness detection | No | No | **Yes** |
| Visual dashboard | No | log4brains | **Yes (built-in)** |
| Works with any language | Yes | Yes | **Yes** |

---

## Benchmark: Next.js Image Optimization

This benchmark is fully reproducible. Clone the repo and run it:

```bash
npm run build
npx tsx benchmarks/nextjs-benchmark.ts
```

**Setup:** Two simulated agents optimize a Next.js image pipeline. Three real production constraints are pre-loaded into WhyCode (based on actual CVE and incident patterns).

- **Agent A** (no WhyCode): Proceeds without consulting decision history
- **Agent B** (with WhyCode): Queries `whycode_check_change` first

**Result:** Agent A introduces an SSRF vulnerability and an OOM risk. Agent B avoids both while still making three valid optimizations.

See [benchmarks/README.md](./benchmarks/README.md) for methodology and the full SWE-bench integration plan.

---

## Architecture

```
your-repo/
├── .whycode/
│   ├── config.json       # Author, repo root
│   └── decisions.db      # SQLite database (WAL mode)
└── ...

whycode CLI               # Interactive commands for humans
whycode-mcp server        # Stdio MCP server for AI agents
whycode dashboard         # Local web UI (Vite + React)
```

All data stays local. No account required. No telemetry.

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for how to run tests, submit benchmarks, and add new MCP tools.

```bash
npm install
npm run build
npm test
```

---

## License

MIT — see [LICENSE](./LICENSE)
