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

## Value Demonstration

See WhyCode in action with a realistic scenario showing concrete, measurable improvements:

```bash
npm run build
npx tsx demo/run-demo-scripted.ts
```

This 30-second demo shows how WhyCode prevents production incidents and speeds up onboarding through documented decision history.

**Results from the demo:**
- 75% faster code reviews (2 hours → 30 minutes)
- 66% faster onboarding (3 days → 1 day)
- 100% incident prevention (3 prevented incidents)
- 20x ROI in the first month

Read the full analysis: [DEMO_RESULTS.md](./DEMO_RESULTS.md)

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
