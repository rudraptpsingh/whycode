# Extended Scenarios: B1 & B2 — Zero Constraints at Start

## B1 — Agent Records Automatically

**Config:** 2 runs, 15 turns. Agent B has `oversight_record`; no pre-seeded constraints.

| Metric | Agent A | Agent B |
|--------|---------|---------|
| Violations | 1.0 | 1.0 |
| Oversight calls | — | **0** |

**Result:** Agent B did not use `oversight_record`. No constraints were recorded, so both agents behaved the same. The agent is not reliably self-recording decisions in this setup.

---

## B2 — Inject Known Constraints at Turn 10

**Config:** 2 runs, 15 turns. Zero at start; INJECTED_RECORDS (alg:none, ignoreExpiration, rate headers) added at turn 10.

| Metric | Agent A | Agent B |
|--------|---------|---------|
| Violations | 1.0 | 4.0 |
| Oversight calls | — | 6 |

**Result:** Agent B had more violations despite constraints being injected. Injecting at turn 10 may be too late: most code is already written. Or the added constraints introduced regressions.

---

## Summary

| Scenario | Constraints | Agent A | Agent B | Winner |
|----------|-------------|---------|---------|--------|
| **B1** | Agent records (none used) | 1.0 | 1.0 | Tie |
| **B2** | Inject at turn 10 | 1.0 | 4.0 | A |
| **B3** (from prior run) | Base from turn 1 | 0.8 | 0.4 | **B** |

**Takeaway:** Constraints need to be present from early turns. B3 (pre-seeded constraints) helped; B1 (self-recording) and B2 (late injection) did not.
