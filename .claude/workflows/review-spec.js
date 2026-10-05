export const meta = {
  name: 'review-spec',
  description: 'Both advisors (quant-advisor, lead-engineer) review one spec in parallel; returns two structured verdicts for the owner',
  whenToUse: 'After a spec is written and before the owner approves it. args: { spec: "docs/superpowers/specs/....md" }',
  phases: [{ title: 'Advise', detail: 'quant + engineering review, in parallel' }],
}

// Cheapest possible shape: exactly two agents, both reading the same spec, no build.
// The owner (via the main session) decides from the two verdicts; this script never builds.
const spec = args && args.spec
if (!spec) throw new Error('review-spec needs args.spec (path to the spec file)')

const VERDICT = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['proceed', 'changes', 'dont'] },
    summary: { type: 'string', description: 'Three plain-language sentences for the owner: what this is, the main risk, the recommendation' },
    changes: { type: 'array', items: { type: 'string' }, description: 'Specific changes to the spec, empty when verdict is proceed' },
    traps: { type: 'array', items: { type: 'string' }, description: 'Data or design traps the build must avoid (one line each)' },
    tests: { type: 'array', items: { type: 'string' }, description: 'Tests that must exist for this to be safe' },
  },
  required: ['verdict', 'summary', 'changes', 'traps', 'tests'],
}

phase('Advise')
log(`Reviewing ${spec} with quant-advisor and lead-engineer`)
const [quant, eng] = await parallel([
  () => agent(`Review the spec at ${spec} per your brief (worth asking? traps? rules fixed? what can the owner do with each outcome? verdict). Read the spec and the files it names; be specific and quote it. Plain language.`,
    { label: 'quant-advisor', agentType: 'quant-advisor', schema: VERDICT }),
  () => agent(`Review the spec at ${spec} per your brief (principles, data model and keys vs reads, pipeline placement and failure isolation, simpler alternative, required tests, verdict). Read the spec and the code it touches; be specific and quote it. Plain language.`,
    { label: 'lead-engineer', agentType: 'lead-engineer', schema: VERDICT }),
])

const overall = [quant, eng].some(v => !v) ? 'incomplete'
  : [quant, eng].some(v => v.verdict === 'dont') ? 'dont'
  : [quant, eng].some(v => v.verdict === 'changes') ? 'changes' : 'proceed'
log(`Verdicts: quant=${quant ? quant.verdict : 'none'}, engineering=${eng ? eng.verdict : 'none'} → ${overall}`)
return { spec, overall, quant, engineering: eng }
