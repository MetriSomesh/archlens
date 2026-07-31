/**
 * Taste enforcement: the em-dash (and en-dash used as a separator) is banned by Taste Skill.
 * We (1) normalize user-provided text to remove them, and (2) lint final output as a hard guard.
 */

const EM_DASH = "\u2014";
const EN_DASH = "\u2013";

/** Replace em/en dashes in agent-provided text with a plain hyphen, collapsing surrounding spaces. */
export function sanitizeText(input: string): string {
  return input
    .replace(new RegExp(`\\s*[${EM_DASH}${EN_DASH}]\\s*`, "g"), " - ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Return the list of banned-dash occurrences (with a small context window) found in `output`. */
export function lintOutput(output: string): string[] {
  const issues: string[] = [];
  for (const [name, ch] of [
    ["em-dash", EM_DASH],
    ["en-dash", EN_DASH],
  ] as const) {
    let idx = output.indexOf(ch);
    while (idx !== -1) {
      const ctx = output.slice(Math.max(0, idx - 20), idx + 20).replace(/\s+/g, " ");
      issues.push(`${name} at ${idx}: ...${ctx}...`);
      idx = output.indexOf(ch, idx + 1);
      if (issues.length > 20) return issues; // cap
    }
  }
  return issues;
}

/** Throw if the output contains any banned dash. Used as the final render guard. */
export function assertNoBannedDashes(output: string): void {
  const issues = lintOutput(output);
  if (issues.length > 0) {
    throw new Error(
      `Taste violation: banned dash characters found in output (Taste Skill em-dash ban).\n` +
        issues.join("\n")
    );
  }
}
