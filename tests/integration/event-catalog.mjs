// Event-catalog conformance: the most recent outbox row of every event type
// in every service database must be a cataloged type and carry every
// required payload key from EVENT_CATALOG.MD. Types the stack hasn't emitted
// yet are listed, not failed — run after the E2E suite for full coverage.
import { readFileSync } from 'node:fs'
import { q, run, assert } from './lib/broker.mjs'

const ok = (s) => console.log(`✓ ${s}`)

const CATALOG = process.env.EVENT_CATALOG || '/catalog/EVENT_CATALOG.MD'
const DBS = ['platform', 'identity', 'requests', 'services', 'jobs', 'workforce',
  'dispatch', 'field', 'billing', 'payouts', 'support', 'notifications']

export function parseCatalog(md) {
  const events = new Map()
  for (const line of md.split('\n')) {
    const cells = line.split(/(?<!\\)\|/).map((c) => c.trim())
    if (cells.length < 5 || !/^`[A-Z]\w*\.\w+`/.test(cells[1])) continue
    const names = [...cells[1].matchAll(/`([\w.]+)`/g)].map((m) => m[1])
    const ctx = names[0].split('.')[0]
    const keyCell = cells[3]
    const required = []
    const optional = []
    // `key` optionally followed by a parenthetical; conditional when it says
    // only/path/optional. Backticks inside parentheticals are enum values.
    for (const m of keyCell.matchAll(/`([a-z_]+)(?:\[\])?`(\s*\(([^)]*)\))?/g)) {
      const pre = keyCell.slice(0, m.index)
      if ((pre.match(/\(/g) || []).length > (pre.match(/\)/g) || []).length) continue
      ;(/only|path|optional/.test(m[3] ?? '') ? optional : required).push(m[1])
    }
    for (const n of names) {
      const type = n.includes('.') ? n : `${ctx}.${n}`
      const req = type.startsWith('Job.') ? ['job_id', ...required] : required
      events.set(type, { required: [...new Set(req)], optional })
    }
  }
  return events
}

await run('EVENT CATALOG', async () => {
  const catalog = parseCatalog(readFileSync(CATALOG, 'utf8'))
  assert(catalog.size > 50, `parsed only ${catalog.size} catalog events`)
  ok(`parsed ${catalog.size} cataloged event types`)
  const seen = new Set()
  const problems = []
  for (const db of DBS) {
    const rows = await q(`serviq_${db}`, `select distinct on (type) type, payload::jsonb as payload
      from outbox order by type, occurred_at desc`)
    for (const { type, payload } of rows) {
      seen.add(type)
      const spec = catalog.get(type)
      if (!spec) { problems.push(`${db}: ${type} is not in EVENT_CATALOG.MD`); continue }
      const missing = spec.required.filter((k) => !(k in (payload ?? {})))
      if (missing.length) problems.push(`${db}: ${type} payload missing ${missing.join(', ')}`)
    }
  }
  ok(`checked latest payload of ${seen.size} emitted event types`)
  const unseen = [...catalog.keys()].filter((t) => !seen.has(t) && !t.startsWith('AI.'))
  if (unseen.length) console.log(`  (not emitted by this stack yet: ${unseen.join(', ')})`)
  assert(!problems.length, `catalog drift:\n    ${problems.join('\n    ')}`)
  ok('every emitted payload carries its cataloged keys')
})
