import { useState } from 'react'
import { api } from '../api'
import { Card, Notice, btn, input, label } from './ui'

// Email invitation — IAM issues a hashed token and the notification
// pipeline renders the email. Until an SMTP adapter ships, the accept
// link comes back in the response and is surfaced here for hand-off.
export default function InviteForm({ token, tenant, role }) {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [link, setLink] = useState(null)

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setErr(null)
    setLink(null)
    try {
      const res = await api.inviteUser(token, tenant, { email, role })
      setLink(res.data?.accept_url || 'Invite created.')
      setEmail('')
    } catch (e2) {
      setErr(e2.fields ? Object.values(e2.fields).flat()[0] : e2.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card title={`Invite ${role.toLowerCase()} by email`}>
      {err && <p className="mb-2 text-sm text-red-600">{err}</p>}
      {link && (
        <Notice>
          Invite sent.{' '}
          {link.startsWith('http')
            ? <a className="break-all underline" href={link}>{link}</a>
            : link}
        </Notice>
      )}
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className={label}>Email</label>
          <input className={input} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <button className={btn} disabled={busy}>{busy ? 'Sending…' : 'Send invite'}</button>
      </form>
    </Card>
  )
}
