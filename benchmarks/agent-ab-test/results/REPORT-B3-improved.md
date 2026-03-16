# Oversight A/B Benchmark — After Improvements

**Scenario:** B3  
**Date:** 2026-03-16  
**Config:** 5 runs per agent, max 15 turns  
**Changes:** auth-004, rate-004, rate-005 added to BASE_RECORDS; fix hints in constraints

---

## Summary

| Metric | Agent A (no Oversight) | Agent B (with Oversight) | Winner |
|--------|------------------------|---------------------------|--------|
| **Violations** | 0.8 ± 0.5 | 0.4 ± 0.6 | **B** |
| **Tokens** | 64,061 | 79,818 | A |
| **Wall time** | 66.7 s | 81.0 s | A |
| **Improvement** | — | **50%** | — |

**Verdict:** Agent B (with Oversight) has fewer violations. Delta: 0.4 fewer violations per run.

---

## Comparison: Before vs After Improvements

| Config | Agent A violations | Agent B violations | Delta |
|--------|-------------------|-------------------|-------|
| **Before** (8 turns, 5 base constraints) | 1.6 ± 1.3 | 3.8 ± 2.2 | B worse |
| **After** (15 turns, 8 base constraints + fix hints) | 0.8 ± 0.5 | 0.4 ± 0.6 | **B better** |

Adding auth-004, rate-004, rate-005 and increasing turns made Oversight effective.
