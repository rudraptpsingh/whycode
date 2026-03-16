# Oversight A/B Benchmark Report — 5 Runs

**Scenario:** B3 (base constraints from start)  
**Date:** 2026-03-16  
**Config:** 5 runs per agent, max 8 turns

---

## Summary

| Metric | Agent A (no Oversight) | Agent B (with Oversight) | Winner |
|--------|------------------------|--------------------------|--------|
| **Violations** | 1.6 ± 1.3 | 3.8 ± 2.2 | **A** |
| **Tokens** | 21,881 | 26,662 | A |
| **Wall time** | 23.7 s | 26.8 s | A |
| **Per-run violations** | 1, 4, 1, 1, 1 | 5, 7, 2, 3, 2 | — |

**Verdict:** Agent A had fewer violations than Agent B across all 5 runs. Oversight did not improve constraint compliance in this setup.

---

## Violation Distribution (per run)

| Run | Agent A | Agent B |
|-----|---------|---------|
| 1 | 1 | 5 |
| 2 | 4 | 7 |
| 3 | 1 | 2 |
| 4 | 1 | 3 |
| 5 | 1 | 2 |

---

## Most Common Violations

**Both agents:** auth-004 (alg:none rejection) — appeared in every run.

**Agent B only:** auth-001 (jwt.verify vs decode), rate-004 (per-endpoint key), rate-005 (rate limit headers), auth-002 (Authorization header), auth-003 (401 on failure).
