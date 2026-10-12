import { useEffect, useState } from 'react'
import { api, rows } from '../../api'
import { useAuth, useTenant } from '../../auth'
import { useDebounced, useLoader } from '../../hooks'
import { Card, Empty, ErrorBox, Loading, PageHead, btn, btnGhost, input, label, link, linkDanger } from '../../components/ui'

const NATIONWIDE = /\b(nationwide|whole (country|philippines)|entire (country|philippines)|all of the philippines)\b/i

// Service areas — where the provider operates. Coverage is declared as
// location chips resolved against the administrative hierarchy: "the
// whole Marikina City" stores the city code; the booking gate expands
// barangays at check time (ancestor walk). Chips may sit at any level —
// region, province, city, or a single barangay.
export default function Areas() {
  const { token } = useAuth()
  const tenant = useTenant()
  const { data: areas, error, loading, reload } = useLoader(
    async () => rows(await api.serviceAreas(token, tenant)), [token, tenant],
  )
  // Demand from rejected bookings — where customers asked for coverage
  // the tenant doesn't have yet. Feeds expansion decisions right where
  // coverage is configured.
  const { data: demand } = useLoader(
    async () => rows(await api.coverageDemand(token, tenant).catch(() => ({ data: [] }))), [token, tenant],
  )
  const [err, setErr] = useState(null)
  const [form, setForm] = useState({ name: '', description: '' })
  const [chips, setChips] = useState([])
  const [editing, setEditing] = useState(null)
  const [formOpen, setFormOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const reset = () => { setForm({ name: '', description: '' }); setChips([]); setEditing(null); setFormOpen(false) }

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setErr(null)
    const body = {
      ...form,
      geo: {
        admin_areas: chips.filter((c) => !c.countrywide).map((c) => c.code),
        ...(chips.some((c) => c.countrywide) ? { countrywide: true } : {}),
      },
    }
    try {
      if (editing) {
        await api.updateServiceArea(token, tenant, editing, body)
      } else {
        await api.createServiceArea(token, tenant, body)
      }
      reset()
      reload()
    } catch (e2) {
      setErr(e2.fields ? Object.values(e2.fields).flat()[0] : e2.message)
    } finally {
      setBusy(false)
    }
  }

  const edit = async (a) => {
    setEditing(a.id)
    setFormOpen(true)
    setForm({ name: a.name, description: a.description || '' })
    // Hydrate stored codes back into chips (names + ancestor sets for
    // dedup); failures degrade to code-only chips.
    const codes = a.geo?.admin_areas || []
    const hydrated = await Promise.all(codes.map(async (code) => {
      try { return (await api.location(token, code)).data } catch { return { code, name: code, level: '', path: '', ancestors: [code] } }
    }))
    if (a.geo?.countrywide) hydrated.unshift({ code: '*', name: 'Nationwide', level: 'country', path: 'Entire Philippines', ancestors: ['*'], countrywide: true })
    setChips(hydrated)
  }

  const remove = async (id) => {
    setErr(null)
    try {
      await api.deleteServiceArea(token, tenant, id)
      if (editing === id) reset()
      reload()
    } catch (e) {
      setErr(e.message)
    }
  }

  const addChip = (loc) => {
    // Redundancy guard: the new pick is already inside an existing
    // chip's coverage — surface it instead of stacking noise.
    const covering = chips.find((c) => !c.countrywide && loc.ancestors?.includes(c.code))
    if (covering) { setErr(`"${loc.name}" is already covered by ${covering.name}.`); return }
    if (chips.some((c) => c.code === loc.code)) return
    setErr(null)
    setChips([...chips, loc])
  }

  const removeChip = (code) => setChips(chips.filter((c) => c.code !== code))

  // Chips absorbed by a broader one (their ancestors include a
  // sibling's code) — kept visible so the admin can prune them.
  const absorbedBy = (chip) =>
    chip.countrywide ? null
      : chips.find((c) => !c.countrywide && c.code !== chip.code && chip.ancestors?.includes(c.code))?.name
        ?? (chips.some((c) => c.countrywide) ? 'Nationwide' : null)

  const geoSummary = (a) => {
    if (a.geo?.countrywide) return 'Nationwide'
    const n = a.geo?.admin_areas?.length || 0
    return n ? `${n} location${n > 1 ? 's' : ''}` : '—'
  }

  return (
    <div className="space-y-4">
      <PageHead title="Service areas" desc="Where you operate — coverage zones agents can be assigned to." />
      <ErrorBox error={error} />
      <ErrorBox error={err} />
      <div className="space-y-4">
        {formOpen && (
        <Card title={editing ? 'Edit area' : 'Add area'}>
          <form onSubmit={submit} className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div><label className={label}>Name</label><input className={input} required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div><label className={label}>Description</label><input className={input} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            </div>

            <div>
              <label className={label}>Coverage</label>
              {chips.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {chips.map((c) => (
                    <span key={c.code} title={c.path}
                      className={`inline-flex items-center gap-1 rounded-md px-2.5 py-0.5 text-sm ${absorbedBy(c) ? 'bg-slate-100 text-slate-400 line-through' : 'bg-violet-100 text-violet-800'}`}>
                      {c.name}{c.level ? ` · ${c.level}` : ''}
                      {absorbedBy(c) && <span className="text-xs no-underline" title={`Absorbed by ${absorbedBy(c)}`}>⊂ {absorbedBy(c)}</span>}
                      <button type="button" onClick={() => removeChip(c.code)} className="font-semibold hover:text-red-700">×</button>
                    </span>
                  ))}
                </div>
              )}
              <CoverageInput token={token} onPick={addChip} />
            </div>

            <div className="flex gap-3">
              <button type="submit" disabled={busy} className={btn}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Add area'}</button>
              <button type="button" onClick={reset} className={btnGhost}>Cancel</button>
            </div>
          </form>
        </Card>
        )}
        {demand && demand.length > 0 && (
          <Card title="Demand from uncovered areas">
            <div className="divide-y divide-slate-100">
              {demand.map((d) => (
                <div key={d.admin_code} className="flex items-baseline justify-between gap-3 px-1 py-2">
                  <div>
                    <div className="text-sm font-medium">{d.name}</div>
                    {d.path && <div className="text-xs text-slate-500">{d.path}</div>}
                  </div>
                  <span className="whitespace-nowrap text-sm font-medium text-violet-700">
                    {d.interested} interested
                  </span>
                </div>
              ))}
            </div>
          </Card>
        )}
        {!formOpen && (
        <div>
          <Card title="Coverage" actions={<button className={btn} onClick={() => { setForm({ name: '', description: '' }); setChips([]); setEditing(null); setFormOpen(true) }}>Add area</button>}>
            {loading ? <Loading /> : !areas || areas.length === 0 ? <Empty text="No service areas configured." /> : (
              <>
              <div className="hidden sm:block overflow-x-auto"><table className="w-full">
                <thead><tr className="border-b border-slate-200"><Th>Name</Th><Th>Coverage</Th><Th>Description</Th><Th /></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {areas.map((a) => (
                    <tr key={a.id}>
                      <td className="px-3 py-2 text-sm font-medium">{a.name}</td>
                      <td className="px-3 py-2 text-sm">{geoSummary(a)}</td>
                      <td className="px-3 py-2 text-sm">{a.description || '—'}</td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-3">
                          <button onClick={() => edit(a)} className={link}>Edit</button>
                          <button onClick={() => remove(a.id)} className={linkDanger}>Remove</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
              <div className="sm:hidden divide-y divide-slate-100">
                {areas.map((a) => (
                  <div key={a.id} className="space-y-1.5 px-1 py-3">
                    <div className="text-sm font-medium">{a.name}</div>
                    <div className="text-sm text-slate-600">{geoSummary(a)}{a.description ? ` — ${a.description}` : ''}</div>
                    <div className="flex gap-3 pt-1">
                      <button onClick={() => edit(a)} className={link}>Edit</button>
                      <button onClick={() => remove(a.id)} className={linkDanger}>Remove</button>
                    </div>
                  </div>
                ))}
              </div>
              </>
            )}
          </Card>
        </div>
        )}
      </div>
    </div>
  )
}

// "Type what you cover" — free text in, ranked location candidates out.
// Scope words stay client-side: `nationwide` maps to the countrywide
// flag, everything else resolves by name match against `locations`.
function CoverageInput({ token, onPick }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const debounced = useDebounced(query)

  useEffect(() => {
    const q = debounced.trim()
    if (q.length < 2 || NATIONWIDE.test(q)) { setResults([]); return }
    setSearching(true)
    api.locationSearch(token, q)
      .then((res) => setResults(res.data || []))
      .catch(() => setResults([]))
      .finally(() => setSearching(false))
  }, [token, debounced])

  const pick = (loc) => { onPick(loc); setQuery(''); setResults([]) }

  return (
    <div className="space-y-1">
      <input
        className={input}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={'Type places you cover — "whole Marikina City", "Brgy. San Roque", "nationwide"'}
      />
      {searching && <div className="text-xs text-slate-500">Searching…</div>}
      {NATIONWIDE.test(query) && (
        <Suggestion name="Nationwide" path="Entire Philippines — covers every location"
          onClick={() => pick({ code: '*', name: 'Nationwide', level: 'country', path: 'Entire Philippines', ancestors: ['*'], countrywide: true })} />
      )}
      {!searching && results.length > 0 && (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {results.map((r) => (
            <Suggestion key={r.code} name={r.name} path={r.path} level={r.level} onClick={() => pick(r)} />
          ))}
        </ul>
      )}
      {!searching && debounced.trim().length >= 2 && results.length === 0 && !NATIONWIDE.test(query) && (
        <div className="text-xs text-slate-500">No matching location — check the spelling or try the parent city.</div>
      )}
    </div>
  )
}

const Suggestion = ({ name, path, level, onClick }) => (
  <li>
    <button type="button" onClick={onClick} className="flex w-full items-baseline justify-between gap-2 px-3 py-2 text-left hover:bg-violet-50">
      <span className="text-sm font-medium text-slate-800">{name}</span>
      <span className="truncate text-xs text-slate-500">{level ? `${level} · ` : ''}{path}</span>
    </button>
  </li>
)

const Th = ({ children }) => <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">{children}</th>
