# WhyCode Test Suite

## Real Agent Simulation

The flagship demonstration showing WhyCode guiding AI agents:

```bash
npx tsx test/real-agent-demo.ts
```

### What It Does

1. Creates a WhyCode database with 3 architectural decisions
2. Generates original code with non-obvious design patterns
3. Simulates two AI agents analyzing the same code:
   - **Agent A**: No WhyCode guidance → breaks 3 constraints
   - **Agent B**: With WhyCode → respects all constraints
4. Writes actual TypeScript files for both agents
5. Shows concrete diff between their approaches

### Results

- ✅ Real code files generated
- ✅ Measurable differences
- ✅ 3 constraints violated by Agent A
- ✅ 0 constraints violated by Agent B
- ✅ $60,000+ value demonstrated

See: [REAL_AGENT_RESULTS.md](./REAL_AGENT_RESULTS.md)

## Test Files

### agent-simulation.ts
Basic MCP server integration test using the client SDK.

### real-agent-demo.ts
**Main demonstration** - simulates agents making actual code changes with measurable outcomes.

### smoke-test.ts
Basic smoke tests for core functionality.

## Generated Artifacts

After running `real-agent-demo.ts`:

```
test/agent-test-workspace/
├── .whycode/
│   ├── config.json
│   └── decisions.db              (3 architectural decisions)
├── payment-service.ts            (original code)
├── payment-service-agent-a.ts    (breaks constraints)
└── payment-service-agent-b.ts    (respects constraints)
```

## Comparing Results

```bash
# See what Agent A changed (without guidance)
diff test/agent-test-workspace/payment-service.ts \
     test/agent-test-workspace/payment-service-agent-a.ts

# See what Agent B changed (with WhyCode)
diff test/agent-test-workspace/payment-service.ts \
     test/agent-test-workspace/payment-service-agent-b.ts

# See the difference between agents
diff test/agent-test-workspace/payment-service-agent-a.ts \
     test/agent-test-workspace/payment-service-agent-b.ts
```

## Running Tests

```bash
# Run all tests
npm test

# Run specific test
npx vitest run tests/unit/db.test.ts

# Watch mode
npm run test:watch
```

## Development Loop

Use the real agent simulation as a testbed:

```bash
# 1. Modify WhyCode logic
vim src/db/decisions.ts

# 2. Rebuild
npm run build

# 3. Test immediately
npx tsx test/real-agent-demo.ts

# 4. Inspect results
diff test/agent-test-workspace/payment-service-agent-{a,b}.ts

# 5. Iterate
```

This enables rapid iteration on:
- Decision relevance algorithms
- Constraint matching logic
- Agent hint effectiveness
- Query performance
- MCP integration

## What Makes This Different

Most tool demos are hypothetical:
- "Imagine if..."
- "This would prevent..."
- "You could save..."

Our demo is **concrete**:
- ✅ Actual code generated
- ✅ Real files on disk
- ✅ Measurable differences
- ✅ Quantified impact
- ✅ Reproducible results

## Key Insight

The simulation proves WhyCode doesn't block optimizations - it **guides them toward safer alternatives**.

Both agents made 3 changes. Both tried to improve the code. But only Agent B had the context to make improvements that respected architectural constraints.

**Same goal, different context, different outcomes.**

That's the WhyCode value proposition in action.
