# Oversight A/B Agent Benchmark

Compares **Agent A** (no Oversight) vs **Agent B** (with Oversight) across 4 scenario types.

## Task

Build a minimal Express API with JWT auth middleware and Redis-based rate limiter. The task has a rich constraint surface from SWE-bench (JWT verify not decode, token from header only, Redis INCR atomic, TTL required, fail-closed on Redis error, etc.).

## Scenarios

| ID | Name | Constraint flow |
|----|------|-----------------|
| B1 | Progressive buildup | Start 0 → Agent B records decisions as it builds |
| B2 | Inject mid-build | Start 0 → inject known constraints at turn 10 |
| B3 | Base from start | Base constraints (5 MUST) from turn 1 |
| B4 | Base + inject | Base from start → inject more at turn 10 |

## Usage

```bash
# Mock run (no API key, creates sample files to test violation checker)
npm run benchmark:agent-ab:mock

# Real run (requires ANTHROPIC_API_KEY)
ANTHROPIC_API_KEY=sk-... npm run benchmark:agent-ab -- --scenario B3 --runs 1

# Options
#   --scenario B1|B2|B3|B4   Default: B3
#   --runs N                 Runs per agent (default 1)
#   --mock                   Use mock files, no LLM calls
```

## Metrics

- **Violations**: Count of MUST constraints violated in final code (regex-based from evaluator)
- **Correctness**: Agent reported "DONE" successfully
- **Turns, tokens, oversight calls, wall time**

## Output

Results written to `benchmarks/agent-ab-test/results/benchmark-{scenario}-{timestamp}.json`.
