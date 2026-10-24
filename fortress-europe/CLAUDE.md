# Fortress Europe Model — working rules

- **Use bun for everything. Never npm or npx.** `bun install`, `bun test`, `bun run build`, `bun scripts/*.ts`, `bun x tsc`.
- Read `README.md` §0 (status) and §9 (known problems) before changing anything.
- Design principles (README §2) are binding:
  - Simplicity, robustness, conciseness and feature completeness.
  - Identity groups, not states.
  - Competence and alignment are separate traits.
  - Resources decide material strength, not power.
  - Personality can force institutions.
  - The outside world follows history.
  - Genocide is a fact of the scenario, not a variable, and it was hidden from neighbors until the absences became undeniable.
- Production code only. No placeholders.
- Never invent personal names for generated people. Use descriptions.
- Keep `bun test` green. After any change to the mechanics, run `bun scripts/report.ts` and compare with README §9. Recalibrate with `bun scripts/calibrate.ts` when the mechanics change.
- Every new factor needs either a data-bounded magnitude or an effect whose direction is clear. Too many unconstrained knobs just turn the author's assumptions into numbers.
