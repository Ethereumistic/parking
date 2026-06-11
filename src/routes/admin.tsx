import { createFileRoute } from '@tanstack/react-router'
import { Authenticated, Unauthenticated, useQuery, useMutation } from 'convex/react'
import { useAuthActions } from '@convex-dev/auth/react'
import { api } from '../../convex/_generated/api'
import { useEffect, useState } from 'react'
import { fallbackParkingConfig } from '../lib/parkingConfig'

export const Route = createFileRoute('/admin')({ component: Admin })

function Admin() {
  return <main className="mx-auto max-w-5xl px-4 py-8"><Unauthenticated><SignIn /></Unauthenticated><Authenticated><AdminPanel /></Authenticated></main>
}

function SignIn() {
  const { signIn } = useAuthActions()
  const [flow, setFlow] = useState<'signIn' | 'signUp'>('signIn')
  const [error, setError] = useState('')
  return <section className="mx-auto max-w-md rounded-3xl border border-white/10 bg-white/[.06] p-6"><h1 className="mb-1 text-3xl font-black">🅿️ Admin</h1><p className="mb-6 text-sm text-white/55">English admin for Parking Smokinya pricing.</p><form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); setError(''); const fd = new FormData(e.currentTarget); fd.set('flow', flow); try { await signIn('password', fd) } catch (err: any) { setError(err.message ?? 'Sign in failed') } }}><input className="w-full rounded-xl border border-white/10 bg-black/25 px-3 py-3" name="email" type="email" placeholder="Email" required /><input className="w-full rounded-xl border border-white/10 bg-black/25 px-3 py-3" name="password" type="password" placeholder="Password" required />{error && <p className="text-sm text-red-300">{error}</p>}<button className="w-full rounded-xl bg-[var(--primary)] px-4 py-3 font-bold">{flow === 'signIn' ? 'Sign in' : 'Create account'}</button><button type="button" className="w-full text-sm text-white/55" onClick={() => setFlow(flow === 'signIn' ? 'signUp' : 'signIn')}>{flow === 'signIn' ? 'Need to create the allowlisted admin account?' : 'Already have an account?'}</button></form></section>
}

function AdminPanel() {
  const { signOut } = useAuthActions()
  const me = useQuery((api as any).auth.me)
  const data = useQuery((api as any).parking.adminGet)
  const saveDraft = useMutation((api as any).parking.saveDraft)
  const publishDraft = useMutation((api as any).parking.publishDraft)
  const seedDraft = useMutation((api as any).parking.seedDraft)
  const [text, setText] = useState('')
  const [status, setStatus] = useState('')
  const config = data?.draft?.config ?? data?.published?.config ?? data?.fallback ?? fallbackParkingConfig
  useEffect(() => { if (data) setText(JSON.stringify(config, null, 2)) }, [data])
  if (me === undefined || data === undefined) return <p>Loading…</p>
  if (!me?.isAdmin) return <section className="rounded-3xl border border-red-300/20 bg-red-300/10 p-6"><h1 className="text-2xl font-bold">Unauthorized</h1><p className="text-white/65">Signed in as {me?.email ?? 'unknown'}, but this email is not in ADMIN_EMAIL_ALLOWLIST.</p><button className="mt-4 rounded-xl border border-white/10 px-4 py-2" onClick={() => void signOut()}>Sign out</button></section>
  return <section className="space-y-5"><div className="flex items-center justify-between gap-3"><div><h1 className="text-3xl font-black">Pricing config</h1><p className="text-sm text-white/55">Signed in as {me.email}. Edit draft JSON, save, then publish.</p></div><button className="rounded-xl border border-white/10 px-4 py-2" onClick={() => void signOut()}>Sign out</button></div><div className="grid gap-3 sm:grid-cols-3"><Stat label="Published version" value={data.published?.version ?? 'fallback'} /><Stat label="Draft version" value={data.draft?.version ?? 'none'} /><Stat label="Updated by" value={data.draft?.updatedBy ?? data.published?.updatedBy ?? '—'} /></div>{status && <div className="rounded-xl bg-blue-400/10 p-3 text-sm text-blue-100">{status}</div>}<textarea className="min-h-[620px] w-full rounded-2xl border border-white/10 bg-black/35 p-4 font-mono text-xs text-white outline-none focus:border-[var(--primary)]" value={text} onChange={(e) => setText(e.target.value)} /><div className="flex flex-wrap gap-3"><button className="rounded-xl border border-white/10 px-4 py-3 font-bold" onClick={async () => { await seedDraft(); setStatus('Draft created from published/fallback config.') }}>Create draft</button><button className="rounded-xl bg-white/10 px-4 py-3 font-bold" onClick={async () => { JSON.parse(text); await saveDraft({ config: JSON.parse(text) }); setStatus('Draft saved.') }}>Save draft</button><button className="rounded-xl bg-[var(--primary)] px-4 py-3 font-bold" onClick={async () => { await publishDraft(); setStatus('Draft published.') }}>Publish draft</button></div></section>
}
function Stat({ label, value }: { label: string; value: any }) { return <div className="rounded-2xl border border-white/10 bg-white/[.05] p-4"><div className="text-xs uppercase tracking-wider text-white/40">{label}</div><div className="mt-1 font-bold">{String(value)}</div></div> }
