# B1 Benchmark — Zero Constraints, Agent Records Automatically

**Scenario:** B1 (start 0 constraints; Agent B can record decisions via oversight_record)  
**Runs:** 2  
**Max turns:** 15  

---

## Summary

| Metric | Agent A | Agent B (oversight_record) | Delta |
|--------|---------|----------------------------|-------|
| **Violations** | 1.0 ± 0 | 1.0 ± 0 | 0 |
| **Oversight calls** | — | 0 | — |
| **Tokens** | 66,184 | 78,026 | +18% |

**Finding:** Agent B had `oversight_record` available but made **0 oversight calls** — no decisions were recorded, so no constraints were injected. Both agents performed the same (1 violation each: auth-004).

---

## Interpretation

- The model did not use `oversight_record` proactively.
- With no recorded decisions, getDecisionsByPath always returned empty → no oversight context was ever shown.
- Possible improvements: stronger prompting to record before editing, or examples in the system prompt.
- B2 (inject known constraints at turn 10) would better test “do late-injected constraints help from zero.”
