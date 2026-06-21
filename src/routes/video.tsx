import { createFileRoute } from '@tanstack/react-router'
import { Authenticated, Unauthenticated, useMutation, useQuery } from 'convex/react'
import { useAuthActions } from '@convex-dev/auth/react'
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { api } from '../../convex/_generated/api'

export const Route = createFileRoute('/video')({ component: Video })

type Role = 'paystation' | 'operator'
type SignalType = 'offer' | 'answer' | 'candidate' | 'presence' | 'bye'
const roomId = 'parking-paystation'
const presenceFreshMs = 20_000

function Video() {
  return <main className="mx-auto max-w-6xl px-4 py-8"><Unauthenticated><SignIn /></Unauthenticated><Authenticated><VideoGate /></Authenticated></main>
}

function SignIn() {
  const { signIn } = useAuthActions()
  const [error, setError] = useState('')
  return <section className="mx-auto max-w-md rounded-3xl border border-white/10 bg-white/[.06] p-6"><h1 className="mb-1 text-3xl font-black">Video intercom</h1><p className="mb-6 text-sm text-white/55">Sign in with an allowlisted admin email.</p><form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); setError(''); const fd = new FormData(e.currentTarget); fd.set('flow', 'signIn'); try { await signIn('password', fd) } catch (err: any) { setError(err.message ?? 'Sign in failed') } }}><input className="w-full rounded-xl border border-white/10 bg-black/25 px-3 py-3" name="email" type="email" placeholder="Email" required /><input className="w-full rounded-xl border border-white/10 bg-black/25 px-3 py-3" name="password" type="password" placeholder="Password" required />{error && <p className="text-sm text-red-300">{error}</p>}<button className="w-full rounded-xl bg-[var(--primary)] px-4 py-3 font-bold">Sign in</button></form></section>
}

function VideoGate() {
  const { signOut } = useAuthActions()
  const me = useQuery((api as any).auth.me)
  if (me === undefined) return <p>Loading…</p>
  if (!me?.isAdmin) return <section className="rounded-3xl border border-red-300/20 bg-red-300/10 p-6"><h1 className="text-2xl font-bold">Unauthorized</h1><p className="text-white/65">Signed in as {me?.email ?? 'unknown'}, but this email is not in ADMIN_EMAIL_ALLOWLIST.</p><button className="mt-4 rounded-xl border border-white/10 px-4 py-2" onClick={() => void signOut()}>Sign out</button></section>
  return <VideoRoom email={me.email ?? 'admin'} />
}

function VideoRoom({ email }: { email: string }) {
  const initialRole = (typeof window !== 'undefined' && localStorage.getItem('videoRole') === 'paystation') ? 'paystation' : 'operator'
  const [role, setRole] = useState<Role>(initialRole)
  const peerId = useMemo(() => `${role}-${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`, [role])
  const [status, setStatus] = useState('Idle')
  const [started, setStarted] = useState(false)
  const [micMuted, setMicMuted] = useState(false)
  const [connectionLost, setConnectionLost] = useState(false)
  const localVideo = useRef<HTMLVideoElement>(null)
  const remoteVideo = useRef<HTMLVideoElement>(null)
  const pc = useRef<RTCPeerConnection | null>(null)
  const localStream = useRef<MediaStream | null>(null)
  const handled = useRef(new Set<string>())
  const pendingCandidates = useRef<RTCIceCandidateInit[]>([])
  const currentCallId = useRef<string | null>(null)
  const startedAt = useRef(0)
  const signals = useQuery((api as any).video.listSignals, { roomId })
  const sendSignal = useMutation((api as any).video.sendSignal)
  const cleanup = useMutation((api as any).video.cleanupSignals)

  const paystationOnline = !!signals?.some((s: any) => s.type === 'presence' && s.payload?.role === 'paystation' && Date.now() - s.createdAt < presenceFreshMs)
  const send = (type: SignalType, payload: any = {}) => sendSignal({ roomId, from: peerId, type, payload: { ...payload, role, at: Date.now() } })

  function closeConnection({ stopMedia = true } = {}) {
    pc.current?.close(); pc.current = null
    if (stopMedia) {
      localStream.current?.getTracks().forEach((t) => t.stop()); localStream.current = null
      if (localVideo.current) localVideo.current.srcObject = null
    }
    if (remoteVideo.current) remoteVideo.current.srcObject = null
    pendingCandidates.current = []
  }

  async function createConnection({ keepMedia = false } = {}) {
    closeConnection({ stopMedia: !keepMedia })
    const conn = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] })
    pc.current = conn
    setConnectionLost(false)
    localStream.current?.getTracks().filter((track) => track.readyState === 'live').forEach((track) => conn.addTrack(track, localStream.current!))
    conn.ontrack = (e) => {
      if (!remoteVideo.current) return
      remoteVideo.current.srcObject = e.streams[0]
      void remoteVideo.current.play().catch(() => setStatus('Tap the video if playback does not start'))
    }
    const handleConnectionState = () => {
      const state = conn.connectionState
      if (state === 'connected') {
        setConnectionLost(false)
        setStatus('Connected')
      } else if (state === 'disconnected' || state === 'failed' || state === 'closed') {
        setConnectionLost(true)
        setStatus('Connection lost — reconnecting may be required')
        if (remoteVideo.current) remoteVideo.current.srcObject = null
      } else {
        setStatus(state)
      }
    }
    conn.onconnectionstatechange = handleConnectionState
    conn.oniceconnectionstatechange = handleConnectionState
    conn.onicecandidate = (e) => {
      if (!e.candidate || !currentCallId.current) return
      const candidate = e.candidate.toJSON()
      void send('candidate', { candidate: candidate.candidate, sdpMid: candidate.sdpMid, sdpMLineIndex: candidate.sdpMLineIndex, usernameFragment: candidate.usernameFragment, callId: currentCallId.current })
    }
    return conn
  }

  async function sendOperatorOffer(conn = pc.current) {
    if (!conn || role !== 'operator') return
    currentCallId.current = crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)
    pendingCandidates.current = []
    const offer = await conn.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true })
    await conn.setLocalDescription(offer)
    await send('offer', { type: offer.type, sdp: offer.sdp, callId: currentCallId.current })
  }

  async function start() {
    startedAt.current = Date.now()
    setStarted(true)
    localStorage.setItem('videoRole', role)
    handled.current.clear()
    await cleanup()
    const conn = await createConnection()

    if (role === 'paystation') {
      setStatus('Starting paystation camera and microphone…')
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: { echoCancellation: true, noiseSuppression: true } })
      localStream.current = stream
      if (localVideo.current) localVideo.current.srcObject = stream
      stream.getTracks().forEach((track) => conn.addTrack(track, stream))
      setStatus('Paystation online — waiting for operator')
      await send('presence', { ready: true })
    } else {
      setStatus(paystationOnline ? 'Calling paystation…' : 'Waiting for paystation to come online…')
      const stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: { echoCancellation: true, noiseSuppression: true } })
      localStream.current = stream
      stream.getAudioTracks().forEach((track) => conn.addTrack(track, stream))
      conn.addTransceiver('video', { direction: 'recvonly' })
      await sendOperatorOffer(conn)
    }
  }

  useEffect(() => {
    if (!started || role !== 'paystation') return
    const id = window.setInterval(() => void send('presence', { ready: true }), 5_000)
    return () => window.clearInterval(id)
  }, [started, role, peerId])

  useEffect(() => {
    if (!started || role !== 'operator') return
    const id = window.setInterval(() => {
      const state = pc.current?.connectionState
      if (state === 'connected' || state === 'completed') return
      void (async () => {
        setStatus('Retrying paystation connection…')
        const conn = await createConnection({ keepMedia: true })
        if (!localStream.current?.getAudioTracks().some((t) => t.readyState === 'live')) {
          const stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: { echoCancellation: true, noiseSuppression: true } })
          localStream.current = stream
          stream.getAudioTracks().forEach((track) => conn.addTrack(track, stream))
        }
        conn.addTransceiver('video', { direction: 'recvonly' })
        await sendOperatorOffer(conn)
      })().catch((err) => setStatus(`Retry failed: ${err.message}`))
    }, 10_000)
    return () => window.clearInterval(id)
  }, [started, role, peerId])

  useEffect(() => () => { void send('bye', { callId: currentCallId.current }); closeConnection() }, [])

  useEffect(() => {
    if (!signals || !pc.current || !started) return
    for (const msg of signals) {
      if (msg.from === peerId || msg.createdAt < startedAt.current || handled.current.has(msg._id)) continue
      handled.current.add(msg._id)
      void (async () => {
        let conn = pc.current!
        const msgCallId = msg.payload?.callId
        if (msg.type === 'offer' && role === 'paystation') {
          currentCallId.current = msgCallId ?? null
          conn = await createConnection({ keepMedia: true })
          await conn.setRemoteDescription({ type: msg.payload.type, sdp: msg.payload.sdp })
          for (const candidate of pendingCandidates.current.splice(0)) await conn.addIceCandidate(new RTCIceCandidate(candidate))
          const answer = await conn.createAnswer()
          await conn.setLocalDescription(answer)
          await send('answer', { type: answer.type, sdp: answer.sdp, callId: currentCallId.current })
          setStatus('Operator connected — streaming paystation camera')
        } else if (msg.type === 'answer' && role === 'operator') {
          if (!msgCallId || msgCallId !== currentCallId.current || conn.signalingState !== 'have-local-offer') return
          await conn.setRemoteDescription({ type: msg.payload.type, sdp: msg.payload.sdp })
          for (const candidate of pendingCandidates.current.splice(0)) await conn.addIceCandidate(new RTCIceCandidate(candidate))
          setStatus('Connecting…')
        } else if (msg.type === 'candidate') {
          if (msgCallId && currentCallId.current && msgCallId !== currentCallId.current) return
          const { callId: _callId, ...candidate } = msg.payload
          if (conn.remoteDescription) await conn.addIceCandidate(new RTCIceCandidate(candidate))
          else pendingCandidates.current.push(candidate)
        } else if (msg.type === 'bye') {
          if (msgCallId && msgCallId === currentCallId.current) setStatus(role === 'paystation' ? 'Paystation online — waiting for operator' : 'Peer disconnected')
        }
      })().catch((err) => setStatus(`Connection error: ${err.message}`))
    }
  }, [signals, peerId, started, role])

  function toggleMic() {
    const next = !micMuted
    localStream.current?.getAudioTracks().forEach((t) => { t.enabled = !next })
    setMicMuted(next)
  }

  return <section className="space-y-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-3xl font-black">Parking video intercom</h1><p className="text-sm text-white/55">Room: {roomId} · signed in as {email}</p></div><div className={`rounded-xl border px-4 py-2 text-sm ${paystationOnline ? 'border-emerald-300/30 bg-emerald-300/10 text-emerald-100' : 'border-amber-300/25 bg-amber-300/10 text-amber-100'}`}>{paystationOnline ? 'Paystation online' : 'Paystation offline'}</div></div>{!started && <div className="rounded-3xl border border-white/10 bg-white/[.06] p-5"><label className="mb-2 block text-sm text-white/55">This device is</label><select className="mb-4 rounded-xl border border-white/10 bg-black/60 px-3 py-3" value={role} onChange={(e) => setRole(e.target.value as Role)}><option value="operator">Operator laptop / phone</option><option value="paystation">Paystation PC</option></select><button className="block rounded-xl bg-[var(--primary)] px-5 py-3 font-bold" onClick={() => void start()}>{role === 'operator' ? 'Connect to paystation' : 'Start paystation camera'}</button></div>}<div className="rounded-xl border border-white/10 px-4 py-2 text-sm">Status: {status}</div>{connectionLost && <div className="rounded-2xl border border-red-300/30 bg-red-500/15 px-4 py-3 font-bold text-red-100">Connection interrupted. The video feed was cleared so you do not mistake a frozen frame for live video. Press Reconnect if it does not recover.</div>}<div className={role === 'paystation' ? 'grid gap-4 lg:grid-cols-2' : ''}><VideoBox title={role === 'operator' ? 'Paystation camera' : 'Operator view'} refEl={remoteVideo} muted={false} big notice={connectionLost ? 'Connection lost' : undefined} />{role === 'paystation' && <VideoBox title="Paystation camera preview" refEl={localVideo} muted />}</div><div className="flex gap-3">{started && <button className="rounded-xl border border-white/10 px-4 py-3 disabled:opacity-40" onClick={toggleMic}>{micMuted ? 'Unmute microphone' : 'Mute microphone'}</button>}<button className="rounded-xl border border-white/10 px-4 py-3" onClick={() => location.reload()}>Reconnect</button></div></section>
}

function VideoBox({ title, refEl, muted, big, notice }: { title: string; refEl: RefObject<HTMLVideoElement | null>; muted: boolean; big?: boolean; notice?: string }) {
  return <div className="overflow-hidden rounded-3xl border border-white/10 bg-black/35"><div className="border-b border-white/10 px-4 py-2 text-sm text-white/60">{title}</div><div className="relative"><video ref={refEl} autoPlay playsInline muted={muted} className={`w-full bg-black object-cover ${big ? 'min-h-[520px]' : 'min-h-[260px]'}`} />{notice && <div className="absolute inset-0 grid place-items-center bg-black/75 text-lg font-black text-red-100">{notice}</div>}</div></div>
}
