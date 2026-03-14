/**
 * WhyCode SWE-bench Constraint Validator
 *
 * Validates that code changes respect documented architectural constraints
 */

export interface Constraint {
  id: string;
  type: "must" | "must_not" | "should" | "avoid";
  category: string;
  description: string;
  rationale: string;
  severity: "critical" | "high" | "medium" | "low";
  validator: string | ((code: string, originalCode: string) => boolean);
  evidence?: string[];
}

export interface ValidationResult {
  constraint: Constraint;
  violated: boolean;
  details?: string;
  confidence: number; // 0-1
}

export interface SWEBenchIssue {
  id: string;
  repo: string;
  issueNumber: number;
  title: string;
  description: string;
  constraints: Constraint[];
  originalCode: string;
  expectedPatterns: string[];
}

export class ConstraintValidator {
  /**
   * Validate a code change against all constraints
   */
  validate(
    issue: SWEBenchIssue,
    proposedCode: string
  ): ValidationResult[] {
    return issue.constraints.map(constraint =>
      this.validateConstraint(constraint, proposedCode, issue.originalCode)
    );
  }

  /**
   * Validate a single constraint
   */
  private validateConstraint(
    constraint: Constraint,
    proposedCode: string,
    originalCode: string
  ): ValidationResult {
    // If validator is a function, use it
    if (typeof constraint.validator === "function") {
      try {
        const passed = constraint.validator(proposedCode, originalCode);
        return {
          constraint,
          violated: !passed,
          confidence: 0.95,
        };
      } catch (error) {
        return {
          constraint,
          violated: true,
          details: `Validator error: ${error}`,
          confidence: 0.5,
        };
      }
    }

    // Otherwise use pattern matching
    return this.patternMatchValidator(constraint, proposedCode, originalCode);
  }

  /**
   * Pattern-based validation (for string validators)
   */
  private patternMatchValidator(
    constraint: Constraint,
    proposedCode: string,
    originalCode: string
  ): ValidationResult {
    const validator = constraint.validator as string;

    // Check if validator is a regex pattern
    if (validator.startsWith("/") && validator.endsWith("/")) {
      const pattern = new RegExp(validator.slice(1, -1));
      const violated = !pattern.test(proposedCode);

      return {
        constraint,
        violated,
        details: violated
          ? `Pattern not found: ${validator}`
          : `Pattern found: ${validator}`,
        confidence: 0.85,
      };
    }

    // Check if validator is a simple string check
    const violated = !proposedCode.includes(validator);

    return {
      constraint,
      violated,
      details: violated
        ? `Expected pattern not found: ${validator}`
        : `Pattern present: ${validator}`,
      confidence: 0.8,
    };
  }

  /**
   * Calculate overall compliance score
   */
  calculateCompliance(results: ValidationResult[]): {
    score: number; // 0-100
    mustViolations: number;
    shouldViolations: number;
    criticalViolations: number;
    wouldMerge: boolean;
  } {
    const mustViolations = results.filter(
      r => r.violated && (r.constraint.type === "must" || r.constraint.type === "must_not")
    ).length;

    const shouldViolations = results.filter(
      r => r.violated && (r.constraint.type === "should" || r.constraint.type === "avoid")
    ).length;

    const criticalViolations = results.filter(
      r => r.violated && r.constraint.severity === "critical"
    ).length;

    const totalConstraints = results.length;
    const violatedConstraints = results.filter(r => r.violated).length;

    // Weighted scoring
    const mustWeight = 1.0;
    const shouldWeight = 0.5;

    const mustTotal = results.filter(
      r => r.constraint.type === "must" || r.constraint.type === "must_not"
    ).length;
    const shouldTotal = results.filter(
      r => r.constraint.type === "should" || r.constraint.type === "avoid"
    ).length;

    const mustScore = mustTotal > 0
      ? ((mustTotal - mustViolations) / mustTotal) * 100
      : 100;
    const shouldScore = shouldTotal > 0
      ? ((shouldTotal - shouldViolations) / shouldTotal) * 100
      : 100;

    const totalWeight = mustWeight + shouldWeight;
    const score =
      (mustScore * mustWeight + shouldScore * shouldWeight) / totalWeight;

    // Would merge if no MUST violations and no critical violations
    const wouldMerge = mustViolations === 0 && criticalViolations === 0;

    return {
      score: Math.round(score),
      mustViolations,
      shouldViolations,
      criticalViolations,
      wouldMerge,
    };
  }

  /**
   * Generate a human-readable report
   */
  generateReport(results: ValidationResult[]): string {
    const compliance = this.calculateCompliance(results);

    let report = "═══════════════════════════════════════════════════\n";
    report += "     CONSTRAINT VALIDATION REPORT\n";
    report += "═══════════════════════════════════════════════════\n\n";

    report += `Overall Compliance: ${compliance.score}%\n`;
    report += `Would Merge: ${compliance.wouldMerge ? "YES ✅" : "NO ❌"}\n\n`;

    if (compliance.criticalViolations > 0) {
      report += `🚨 CRITICAL VIOLATIONS: ${compliance.criticalViolations}\n`;
    }
    if (compliance.mustViolations > 0) {
      report += `❌ MUST Violations: ${compliance.mustViolations}\n`;
    }
    if (compliance.shouldViolations > 0) {
      report += `⚠️  SHOULD Violations: ${compliance.shouldViolations}\n`;
    }

    report += "\nDetailed Results:\n";
    report += "─────────────────────────────────────────────────\n\n";

    results.forEach((result, i) => {
      const icon = result.violated ? "❌" : "✅";
      const severity = result.constraint.severity.toUpperCase().padEnd(8);

      report += `${i + 1}. ${icon} [${severity}] ${result.constraint.description}\n`;
      report += `   Type: ${result.constraint.type.toUpperCase()}\n`;
      report += `   Category: ${result.constraint.category}\n`;

      if (result.violated) {
        report += `   ⚠️  VIOLATED: ${result.details || "Pattern not found"}\n`;
        report += `   Impact: ${result.constraint.rationale}\n`;
      } else {
        report += `   ✅ RESPECTED\n`;
      }

      report += "\n";
    });

    return report;
  }
}

/**
 * Example: Django QuerySet Constraints
 */
export const djangoQuerySetConstraints: Constraint[] = [
  {
    id: "django-orm-001",
    type: "must",
    category: "API Contract",
    description: "QuerySet methods must return QuerySet (chainability)",
    rationale: "Django ORM fundamental pattern. Breaking this breaks all chaining code.",
    severity: "critical",
    validator: (code: string) => {
      // Check that we're returning QuerySet, not list/array
      const returnsQuerySet = /return\s+.*QuerySet/.test(code) ||
        /return\s+self/.test(code) ||
        /return\s+queryset/.test(code);

      const returnsList = /return\s+\[/.test(code) ||
        /return\s+list\(/.test(code) ||
        /return\s+results/.test(code);

      return returnsQuerySet && !returnsList;
    },
    evidence: [
      "Django docs: QuerySet API Reference",
      "Design pattern since Django 1.0 (2008)",
    ],
  },
  {
    id: "django-orm-002",
    type: "must_not",
    category: "Performance Contract",
    description: "Must not introduce N+1 queries",
    rationale: "select_related() exists to prevent N+1. Adding queries defeats the purpose.",
    severity: "critical",
    validator: (code: string) => {
      // Look for patterns that cause N+1
      const hasLoop = /for\s+\w+\s+in\s+/.test(code);
      const hasGetattr = /getattr\(/.test(code);
      const hasRelationAccess = /\.\w+_set\./.test(code);

      // If there's a loop with relation access, likely N+1
      return !(hasLoop && (hasGetattr || hasRelationAccess));
    },
    evidence: [
      "Django docs: select_related() reduces database queries",
      "Performance benchmark: N+1 causes 100x slowdown",
      "Production incident: INC-DJANGO-N+1-2024",
    ],
  },
  {
    id: "django-orm-003",
    type: "must",
    category: "Implementation Pattern",
    description: "Must use Django's SQL compiler (not raw SQL)",
    rationale: "Database abstraction, security, and compatibility requirement",
    severity: "high",
    validator: (code: string) => {
      // Check for raw SQL usage
      const hasRawSQL = /\.raw\(/.test(code) ||
        /cursor\.execute\(/.test(code) ||
        /\"SELECT .* FROM/.test(code) ||
        /'SELECT .* FROM/.test(code);

      return !hasRawSQL;
    },
    evidence: [
      "Django architecture: Don't bypass the ORM",
      "Security: Raw SQL bypasses parameter escaping",
      "Compatibility: Database-specific SQL breaks multi-DB support",
    ],
  },
  {
    id: "django-orm-004",
    type: "must",
    category: "Correctness",
    description: "Must handle nullable foreign keys (use LEFT OUTER JOIN)",
    rationale: "Foreign keys can be NULL. INNER JOIN filters them out incorrectly.",
    severity: "critical",
    validator: (code: string) => {
      // Check if using INNER JOIN (bad) vs LEFT OUTER JOIN (good)
      const hasInnerJoin = /INNER\s+JOIN/.test(code);
      const filtersNull = /isnull=False/.test(code);

      // If manually constructing SQL, should not use INNER JOIN
      return !hasInnerJoin && !filtersNull;
    },
    evidence: [
      "SQL correctness: INNER JOIN changes result set",
      "Django ORM contract: select_related() doesn't filter",
      "Historical bug: CVE-adjacent issue where INNER JOIN lost data",
    ],
  },
];

/**
 * Example usage
 */
export function runDjangoExample() {
  const validator = new ConstraintValidator();

  // Bad code: Returns list (violates chainability)
  const badCode = `
    def optimize_select_related(queryset, relations):
        results = []
        for obj in queryset.select_related(*relations):
            results.append(obj)
        return results  # Returns list!
  `;

  // Good code: Returns QuerySet
  const goodCode = `
    def optimize_select_related(queryset, relations):
        # Optimize JOIN order based on table sizes
        ordered_relations = sort_by_table_size(relations)
        return queryset.select_related(*ordered_relations)
  `;

  const issue: SWEBenchIssue = {
    id: "django-001",
    repo: "django/django",
    issueNumber: 12345,
    title: "Optimize QuerySet select_related performance",
    description: "Deep foreign key chains cause slow JOINs",
    constraints: djangoQuerySetConstraints,
    originalCode: "",
    expectedPatterns: [],
  };

  console.log("Testing BAD code:");
  const badResults = validator.validate(issue, badCode);
  console.log(validator.generateReport(badResults));

  console.log("\n\nTesting GOOD code:");
  const goodResults = validator.validate(issue, goodCode);
  console.log(validator.generateReport(goodResults));
}

// Export for testing
if (import.meta.url === `file://${process.argv[1]}`) {
  runDjangoExample();
}
