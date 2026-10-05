export const meta = {
  name: 'ship-feature',
  description: 'Build an APPROVED spec end-to-end on a branch: technical-lead builds, three read-only checkers run in parallel on the diff, one fix pass only if needed, one final code review; returns a merge-ready report. Never merges or pushes.',
  whenToUse: 'After the owner has approved a spec (review-spec ran first). args: { spec: "docs/superpowers/specs/....md", ui: true|false, study: true|false }',
  phases: [
    { title: 'Build', detail: 'technical-lead: plan, TDD, real-data check, docs, branch' },
    { title: 'Check', detail: 'data-integrity + test-auditor (+ plain-language on UI/docs), in parallel, diff only' },
    { title: 'Fix', detail: 'technical-lead fixes Critical/Important only; skipped when there are none' },
    { title: 'Review', detail: 'one independent code review of the whole branch' },
  ],
}

// Token discipline, by design:
// - one builder, not a fleet; checkers read ONLY the changed files (passed explicitly);
// - structured outputs everywhere (no re-parsing prose);
// - the fix pass and the plain-language editor run only when they have something to do;
// - nothing here talks to the owner: approval happened before, merge happens after.
const spec = args && args.spec
if (!spec) throw new Error('ship-feature needs args.spec (an APPROVED spec path)')
const wantsUi = !!(args && args.ui)
const isStudy = !!(args && args.study)

const BUILD = {
  type: 'object',
  properties: {
    branch: { type: 'string' },
    commits: { type: 'array', items: { type: 'string' } },
    changedFiles: { type: 'array', items: { type: 'string' }, description: 'Repo-relative paths changed on the branch vs main' },
    ownerFacingFiles: { type: 'array', items: { type: 'string' }, description: 'Pages, glossary, decisions, research docs changed: what the owner reads' },
    reviewPackage: { type: 'string', description: 'Path of the review-package diff file written under .superpowers/sdd/' },
    ledger: { type: 'string', description: 'Path of the ledger (progress.md) with every Ruling: line' },
    rulings: { type: 'array', items: { type: 'string' } },
    checks: { type: 'string', description: 'Tests count, typecheck, the independent spot-check numbers, screenshots taken' },
    openQuestions: { type: 'array', items: { type: 'string' } },
    stopped: { type: 'boolean', description: 'true if the builder stopped early (no approved spec, a hard rule would be broken, or decisions are needed)' },
    stopReason: { type: 'string' },
  },
  required: ['branch', 'commits', 'changedFiles', 'ownerFacingFiles', 'reviewPackage', 'ledger', 'rulings', 'checks', 'openQuestions', 'stopped', 'stopReason'],
}
const FINDINGS = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: ['critical', 'important', 'minor'] },
          file: { type: 'string' }, line: { type: 'integer' },
          summary: { type: 'string' }, failureCase: { type: 'string' }, fix: { type: 'string' },
        },
        required: ['severity', 'file', 'summary', 'failureCase', 'fix'],
      },
    },
    checkedFine: { type: 'array', items: { type: 'string' } },
  },
  required: ['findings', 'checkedFine'],
}

phase('Build')
log(`technical-lead building ${spec}`)
const build = await agent(
  `Build the approved spec at ${spec} end-to-end per your brief: plan, branch, test-first tasks, real-data run with an independent spot-check, screenshots if UI, decision file and docs. Do NOT merge, push, delete data, or touch port 3000. ` +
  `At the end, run the review-package script (superpowers subagent-driven-development/scripts/review-package PLAN_FILE $(git merge-base main HEAD) HEAD) and report its path, the ledger path, every Ruling: line, and the list of changed files (git diff --name-only main...HEAD) split into all files and owner-facing files. If you must stop early, say so with the reason and the decisions needed.`,
  { label: 'technical-lead', agentType: 'technical-lead', schema: BUILD })
if (!build) return { status: 'failed', reason: 'builder returned nothing' }
if (build.stopped) return { status: 'stopped', build }
log(`Built on ${build.branch}: ${build.commits.length} commits, ${build.changedFiles.length} files changed`)

phase('Check')
const files = build.changedFiles.join(', ')
const checks = [
  () => agent(`Review ONLY these changed files on branch ${build.branch} (diff at ${build.reviewPackage}): ${files}. Spec: ${spec}.${isStudy ? ' This is a research study: apply the study-design items of your checklist in full.' : ''} Run your full checklist; spot-check with independent read-only SQL; report per your format.`,
    { label: 'data-integrity', agentType: 'data-integrity-reviewer', phase: 'Check', schema: FINDINGS }),
  () => agent(`Audit the tests touched or needed by these changed files on branch ${build.branch}: ${files}. Diff at ${build.reviewPackage}; spec at ${spec}. Run the relevant test files from the repo root, then report per your format (would-miss-a-real-break / weak / nice-to-have, with the exact test to add).`,
    { label: 'test-auditor', agentType: 'test-auditor', phase: 'Check', schema: FINDINGS }),
]
if (wantsUi || build.ownerFacingFiles.length) {
  checks.push(() => agent(`Edit for plain language and honesty ONLY these owner-facing files on branch ${build.branch}: ${build.ownerFacingFiles.join(', ')}. Report misleading first, then unclear, then polish, with before→after rewrites.`,
    { label: 'plain-language', agentType: 'plain-language-editor', phase: 'Check', schema: FINDINGS }))
} else {
  log('No owner-facing text changed: plain-language editor skipped')
}
// Barrier is correct here: the single fix pass needs every checker's findings at once.
const results = (await parallel(checks)).filter(Boolean)
const all = results.flatMap(r => r.findings)
const mustFix = all.filter(f => f.severity !== 'minor')
const minors = all.filter(f => f.severity === 'minor')
log(`Checkers: ${mustFix.length} must-fix, ${minors.length} minor`)

phase('Fix')
let fix = null
if (mustFix.length) {
  fix = await agent(
    `On branch ${build.branch}, fix these Critical/Important findings only, each under TDD (failing test first), then run the full suite from the repo root and typecheck; append each fix to the ledger at ${build.ledger}; regenerate the review package. Do not touch the minors. Findings:\n${JSON.stringify(mustFix, null, 2)}`,
    { label: 'technical-lead (fix pass)', agentType: 'technical-lead', phase: 'Fix', schema: BUILD })
} else {
  log('Nothing to fix: fix pass skipped')
}
const pkg = (fix && fix.reviewPackage) || build.reviewPackage

phase('Review')
const review = await agent(
  `You are the independent final reviewer. Follow ~/.claude/plugins/cache/claude-plugins-official/superpowers/6.4.1/skills/requesting-code-review/code-reviewer.md. Review package: ${pkg}. Spec: ${spec}. Ledger (rulings): ${build.ledger}. The checkers already reported: ${JSON.stringify(all.map(f => `${f.severity}: ${f.summary}`))}; do not repeat them, verify they were addressed (must-fix) and look for what they missed. Read-only. Report Critical / Important / Minor with file:line and a failure scenario, and a verdict.`,
  { label: 'code-reviewer', phase: 'Review', schema: FINDINGS })

const unresolved = review ? review.findings.filter(f => f.severity !== 'minor') : []
log(`Final review: ${unresolved.length} unresolved must-fix, ${review ? review.findings.length - unresolved.length : 0} minor`)
return {
  status: unresolved.length ? 'needs-attention' : 'merge-ready',
  branch: build.branch,
  spec,
  build: { commits: build.commits, checks: build.checks, rulings: build.rulings.concat(fix ? fix.rulings : []), openQuestions: build.openQuestions },
  checkers: results,
  fixPass: fix ? { commits: fix.commits, checks: fix.checks } : 'skipped',
  finalReview: review,
  deferredMinors: minors.concat(review ? review.findings.filter(f => f.severity === 'minor') : []),
}
