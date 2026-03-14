# WhyCode

WhyCode is a developer tool designed to capture the **rationale** behind code changes. It helps AI agents (and humans) understand *why* a decision was made, preventing regressions and preserving architectural intent.

## Problem

AI agents often lack historical context. They might see a piece of code and "fix" it or "refactor" it, unknowingly breaking a subtle but intentional architectural decision made in the past.

## Solution

WhyCode provides a structured way to record decisions, constraints, and intent alongside the code. By making this context accessible to agents, WhyCode ensures that they operate with a full understanding of the project's history.

## Features

- **Decision Tracking**: Capture the "why" behind significant changes.
- **Agent-First Design**: Optimized for ingestion by AI coding assistants.
- **Context Stashing**: Easily save and retrieve relevant snippets of information.

## Real Agent Simulation

See WhyCode guiding actual AI agents making real code changes:

```bash
npm run build
npx tsx test/real-agent-demo.ts
```

**This creates actual code files** showing how two simulated agents modify the same code:
- **Agent A** (no guidance): Makes 3 changes that violate critical constraints
- **Agent B** (with WhyCode): Makes 3 DIFFERENT changes that respect constraints

**Real results:**
- Actual TypeScript files generated for comparison
- Concrete diff showing line-by-line differences
- Agent B prevents 3 production incidents while still improving code
- ~$60,000+ value from incident prevention

See the results: [test/REAL_AGENT_RESULTS.md](./test/REAL_AGENT_RESULTS.md)

## Scenario Demo

For a narrative walkthrough of the value proposition:

```bash
npx tsx demo/run-demo-scripted.ts
```

Full analysis: [DEMO_RESULTS.md](./DEMO_RESULTS.md)

## Quick Start

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Initialize WhyCode in your project
npx whycode init

# Capture a decision
npx whycode capture

# List all decisions
npx whycode list

# Check decisions for a file
npx whycode check src/myfile.ts

# Search decisions
npx whycode search "rate limiting"
```

## Features

- **Decision Tracking**: Capture the "why" behind significant changes
- **Agent-First Design**: Optimized for AI coding assistants via MCP
- **Full-Text Search**: Find relevant decisions quickly
- **Code Anchors**: Link decisions to specific files, functions, or lines
- **Staleness Detection**: Identify decisions that may need review
- **Git Integration**: Post-commit reminders for documenting changes
- **Rich Context**: Constraints, alternatives, rationale, and agent hints

## Use Cases

WhyCode is valuable when:
- A design choice looks "wrong" but has important rationale
- You've learned from a production incident
- Compliance or security requirements drive implementation
- Performance optimizations have specific constraints
- Architecture decisions need to be preserved
- AI agents need context to make safe changes

## Architecture

- **CLI**: Interactive commands for developers
- **MCP Server**: Integration with AI coding assistants
- **SQLite Database**: Local storage for decision records
- **Full-Text Search**: Fast decision discovery
- **Git Hooks**: Optional reminders for documentation
