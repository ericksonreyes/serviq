import { useEffect, useState } from 'react'
import { api } from '../api'
import { useAuth } from '../auth'
import { ErrorBox, btn, card, label } from '../ui'

export default function Settings() {
  const { token } = useAuth()
  const [doc, setDoc] = useState(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    api
      .settings(token)
      .then((res) => {
        setDoc(res.data)
        setText(JSON.stringify(res.data.settings ?? {}, null, 2))
      })
      .catch((err) => setError(err.message))
  }, [token])

  const submit = async (e) => {
    e.preventDefault()
    let parsed
    try {
      parsed = JSON.parse(text || '{}')
    } catch {
      setError('Settings must be valid JSON.')
      return
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      setError('Settings must be a JSON object.')
      return
    }
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const res = await api.saveSettings(token, parsed)
      setDoc(res.data)
      setText(JSON.stringify(res.data.settings ?? {}, null, 2))
      setDirty(false)
      setNotice('Settings saved.')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Settings & policies</h1>
        <p className="mt-1 text-sm text-slate-500">
          Platform-wide configuration document — e.g. support contact, maintenance mode, onboarding
          policy flags. Stored verbatim; consumers read the keys they understand.
        </p>
      </div>
      <ErrorBox error={error} />
      {notice && (
        <div className="rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">{notice}</div>
      )}
      {!doc && !error && <p className="text-sm text-slate-500">Loading…</p>}
      {doc && (
        <form onSubmit={submit} className={`${card} space-y-3`}>
          <div>
            <label className={label}>Platform settings (JSON)</label>
            <textarea
              className="mt-1 h-80 w-full rounded-lg border border-slate-300 p-3 font-mono text-sm focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600"
              value={text}
              onChange={(e) => {
                setText(e.target.value)
                setDirty(true)
              }}
              spellCheck={false}
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500">
              Last updated: {doc.updated_at ? new Date(doc.updated_at).toLocaleString() : 'never'}
            </span>
            <button type="submit" className={btn} disabled={busy || !dirty}>
              {busy ? 'Saving…' : 'Save settings'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
