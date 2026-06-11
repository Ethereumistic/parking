import { createFileRoute, useNavigate, useSearch } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import { useEffect, useMemo, useState } from 'react'
import type { DateRange } from 'react-day-picker'
import { MapPin, Phone } from 'lucide-react'
import { Button } from '#/components/ui/button.tsx'
import { Calendar } from '#/components/ui/calendar.tsx'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#/components/ui/table.tsx'
import { calculateRegular, calculateSubscription, dayWord, fmtDate, fmtTime } from '../lib/parkingCalc'
import { fallbackParkingConfig, type ParkingConfig } from '../lib/parkingConfig'

type Mode = 'regular' | 'subscription'

export const Route = createFileRoute('/')({
  validateSearch: (s: Record<string, unknown>) => ({
    mode: s.mode === 'subscription' ? 'subscription' : 'regular',
    arr_date: typeof s.arr_date === 'string' ? s.arr_date : '',
    dep_date: typeof s.dep_date === 'string' ? s.dep_date : '',
    arr_time: typeof s.arr_time === 'string' ? s.arr_time : '10:00',
    dep_time: typeof s.dep_time === 'string' ? s.dep_time : '10:00',
  }),
  component: App,
})

function dateFromIso(value: string) {
  if (!value) return undefined
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function isoFromDate(date?: Date) {
  if (!date) return ''
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function App() {
  const search = useSearch({ from: '/' })
  const navigate = useNavigate({ from: '/' })
  const liveConfig = useQuery((api as any).parking.getPublished) as ParkingConfig | undefined
  const config = liveConfig ?? fallbackParkingConfig
  const usingFallback = liveConfig === undefined
  const [copied, setCopied] = useState(false)

  const setSearch = (patch: Partial<typeof search>) => navigate({ search: { ...search, ...patch }, replace: true })
  const mode = search.mode as Mode
  const result = useMemo(() => mode === 'regular'
    ? calculateRegular(config, search.arr_date, search.arr_time, search.dep_date, search.dep_time)
    : calculateSubscription(config, search.arr_date, search.dep_date), [config, mode, search])

  async function copyLink() {
    await navigator.clipboard.writeText(window.location.href)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:py-8">
      <section className="mb-5 overflow-hidden rounded-[2rem] border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,.09),rgba(255,255,255,.035))] p-5 shadow-2xl sm:p-7">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[.22em] text-blue-300">Летен сезон {config.activeYear}</p>
        <h1 className="text-4xl font-black tracking-tight sm:text-6xl"><span className="mr-2">🅿️</span>{config.siteName}</h1>
        <p className="mt-2 text-sm text-white/60">{config.seasonStart} – {config.seasonEnd} · Europe/Sofia</p>
        {usingFallback && <div className="mt-4 rounded-xl border border-amber-300/30 bg-amber-300/10 p-3 text-sm text-amber-100">Зареждане на актуални цени… показани са резервните цени за 2026.</div>}
        <div className="mt-5 grid grid-cols-2 gap-2 rounded-2xl bg-black/25 p-1">
          {(['regular', 'subscription'] as Mode[]).map((m) => (
            <Button key={m} variant={mode === m ? 'default' : 'ghost'} className="h-12 rounded-xl text-sm font-bold" onClick={() => setSearch({ mode: m })}>
              {m === 'regular' ? 'Редовно' : 'Абонамент'}
            </Button>
          ))}
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(380px,.95fr)] lg:items-start">
        <section className="rounded-[1.5rem] border border-white/10 bg-white/[.06] p-4 sm:p-5">
          <h2 className="mb-4 text-lg font-black">Изберете период</h2>
          {mode === 'subscription' ? <SubscriptionPicker config={config} search={search} setSearch={setSearch} /> : <RegularPicker config={config} search={search} setSearch={setSearch} />}
          <div className="mt-4 grid gap-2 text-xs text-white/70 sm:grid-cols-2">
            <div className="rounded-xl bg-white/[.06] p-3">☀️ Ден: {config.regular.dayStart} – {config.regular.nightStart}</div>
            <div className="rounded-xl bg-white/[.06] p-3">🌙 Нощ: {config.regular.nightStart} – {config.regular.dayStart}</div>
          </div>
        </section>

        <section className="overflow-hidden rounded-[1.5rem] border border-white/10 bg-[#101116]">
          {!result.ok ? (
            <div className="p-6 text-center text-white/60">
              <p>{result.message}</p>
              {result.switchMode && <Button className="mt-3 rounded-full" onClick={() => setSearch({ mode: result.switchMode })}>Към {result.switchMode === 'regular' ? 'редовно' : 'абонамент'}</Button>}
            </div>
          ) : <Result result={result} currency={config.currency} onCopy={copyLink} copied={copied} />}
        </section>
      </div>

      <PricingReference config={config} />
      <LocationCard />
    </main>
  )
}

function RegularPicker({ config, search, setSearch }: { config: ParkingConfig; search: any; setSearch: (p: any) => void }) {
  const min = dateFromIso(config.seasonStart)
  const max = dateFromIso(config.seasonEnd)
  const selected: DateRange = { from: dateFromIso(search.arr_date), to: dateFromIso(search.dep_date) }
  const [months, setMonths] = useState(1)
  useEffect(() => {
    const update = () => setMonths(window.innerWidth >= 768 ? 2 : 1)
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
      <Calendar
        mode="range"
        numberOfMonths={months}
        selected={selected}
        onSelect={(range) => setSearch({ arr_date: isoFromDate(range?.from), dep_date: isoFromDate(range?.to) })}
        disabled={{ before: min!, after: max! }}
        className="mx-auto rounded-xl border border-white/10 bg-transparent [--cell-size:--spacing(9)]"
      />
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl bg-white/[.06] p-3">
          <div className="mb-2 text-xs font-bold uppercase tracking-wider text-white/45">Пристигане</div>
          <div className="mb-3 text-sm font-semibold text-white">{search.arr_date || 'Изберете дата'}</div>
          <TimeInput label="Час" value={search.arr_time} onChange={(v) => setSearch({ arr_time: v })} />
        </div>
        <div className="rounded-xl bg-white/[.06] p-3">
          <div className="mb-2 text-xs font-bold uppercase tracking-wider text-white/45">Заминаване</div>
          <div className="mb-3 text-sm font-semibold text-white">{search.dep_date || 'Изберете дата'}</div>
          <TimeInput label="Час" value={search.dep_time} onChange={(v) => setSearch({ dep_time: v })} />
        </div>
      </div>
    </div>
  )
}

function SubscriptionPicker({ config, search, setSearch }: { config: ParkingConfig; search: any; setSearch: (p: any) => void }) {
  const min = dateFromIso(config.seasonStart)
  const max = dateFromIso(config.seasonEnd)
  const selected: DateRange = { from: dateFromIso(search.arr_date), to: dateFromIso(search.dep_date) }
  const [months, setMonths] = useState(1)
  useEffect(() => {
    const update = () => setMonths(window.innerWidth >= 768 ? 2 : 1)
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
      <Calendar
        mode="range"
        numberOfMonths={months}
        selected={selected}
        onSelect={(range) => setSearch({ arr_date: isoFromDate(range?.from), dep_date: isoFromDate(range?.to) })}
        disabled={{ before: min!, after: max! }}
        className="mx-auto rounded-xl border border-white/10 bg-transparent [--cell-size:--spacing(9)]"
      />
      <div className="mt-3 grid gap-2 text-sm text-white/65 sm:grid-cols-2">
        <div className="rounded-xl bg-white/[.06] p-3">Пристигане: <strong className="text-white">{search.arr_date || '—'}</strong></div>
        <div className="rounded-xl bg-white/[.06] p-3">Заминаване: <strong className="text-white">{search.dep_date || '—'}</strong></div>
      </div>
    </div>
  )
}

function TimeInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return <label className="mt-3 block"><span className="mb-1 block text-xs font-bold uppercase tracking-wider text-white/50">{label}</span><input className="w-full rounded-xl border border-white/10 bg-black/25 px-3 py-3 text-white outline-none focus:border-[var(--primary)]" type="time" value={value} onChange={(e) => onChange(e.target.value)} /></label>
}

function Result({ result, currency, onCopy, copied }: any) {
  return <div className="p-6"><div className="mb-2 inline-flex rounded-full bg-blue-500/15 px-3 py-1 text-xs font-bold text-blue-200">◆ {result.mode === 'regular' ? `Редовно · ${result.intervals.length} интервала` : result.tier.labelBg}</div><div className="text-sm uppercase tracking-widest text-white/40">Обща сума</div><div className="mb-1 text-6xl font-black"><span className="text-2xl text-blue-300">{currency}</span>{result.total}</div>{result.mode === 'subscription' && <div className="text-sm text-white/50">≈ {currency}{result.effective} на ден средно · {dayWord(result.totalDays)}</div>}{result.mode === 'regular' && <RegularRows result={result} currency={currency} />}{result.mode === 'subscription' && <SubRows result={result} currency={currency} />}<Button onClick={onCopy} variant="outline" className="mt-5 w-full rounded-xl border-white/10 bg-white/5 text-white/80 hover:bg-white/10 hover:text-white">{copied ? 'Линкът е копиран!' : 'Копирай линк'}</Button></div>
}
function RegularRows({ result, currency }: any) { return <div className="mt-5 max-h-80 overflow-auto rounded-xl border border-white/10"><Table><TableBody>{result.intervals.map((iv: any, i: number) => <TableRow className="border-white/10 hover:bg-white/[.04]" key={i}><TableCell className="text-white/40">{i + 1}</TableCell><TableCell>{fmtDate(iv.startMs)} {fmtTime(iv.startMs)} → {fmtDate(iv.endMs)} {fmtTime(iv.endMs)}</TableCell><TableCell className="text-white/60">{iv.season === 'low' ? 'Нисък' : 'Висок'} · {iv.period === 'day' ? 'Ден' : 'Нощ'}</TableCell><TableCell className="text-right font-bold">{currency}{iv.rate}</TableCell></TableRow>)}</TableBody></Table></div> }
function SubRows({ result, currency }: any) { return <div className="mt-5 space-y-2">{result.rows.map((r: any) => <div key={r.label} className="flex items-center justify-between rounded-xl bg-white/[.06] p-3"><div><div>{r.label}</div><div className="text-xs text-white/45">{r.days} дни × {currency}{r.rate}/ден</div></div><strong>{currency}{r.amount}</strong></div>)}</div> }

function PricingReference({ config }: { config: ParkingConfig }) {
  return <section className="mt-5 rounded-[1.5rem] border border-white/10 bg-white/[.04] p-4 sm:p-5"><h2 className="mb-3 text-sm font-black uppercase tracking-wider text-white/60">Ценова справка</h2><div className="rounded-xl border border-white/10"><Table><TableHeader><TableRow className="border-white/10 hover:bg-transparent"><TableHead>Сезон</TableHead><TableHead>Дати</TableHead><TableHead>Ден</TableHead><TableHead>Нощ</TableHead><TableHead>Абонамент</TableHead></TableRow></TableHeader><TableBody>{config.seasons.map((s) => <TableRow key={s.id} className="border-white/10 hover:bg-white/[.04]"><TableCell className="font-semibold">{s.labelBg}</TableCell><TableCell>{s.start} – {s.end}</TableCell><TableCell>{config.currency}{config.regular.rates[s.type].day}</TableCell><TableCell>{config.currency}{config.regular.rates[s.type].night}</TableCell><TableCell className="min-w-[280px] text-white/70">{config.subscription.tiers.map((t) => `${t.labelBg}: ${config.currency}${t.rates[s.type]}`).join(' · ')}</TableCell></TableRow>)}</TableBody></Table></div></section>
}

function LocationCard() {
  return (
    <section className="mt-5 grid gap-4 rounded-[1.5rem] border border-white/10 bg-[linear-gradient(135deg,rgba(59,130,246,.16),rgba(255,255,255,.04))] p-5 sm:grid-cols-[1fr_auto] sm:items-center">
      <div>
        <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-blue-100"><MapPin className="size-3.5" /> Локация</div>
        <h2 className="text-2xl font-black">Паркинг Smokinya, Созопол</h2>
        <p className="mt-2 max-w-2xl text-sm text-white/60">Отворете точната локация в Google Maps за навигация до паркинга.</p>
        <a className="mt-3 inline-flex items-center gap-2 text-sm font-bold text-white no-underline" href="tel:+359884897264"><Phone className="size-4" /> +359 884 897 264</a>
      </div>
      <div className="grid gap-2 sm:min-w-52">
        <Button asChild className="h-12 rounded-xl"><a href="https://maps.app.goo.gl/3qmkrdLUG4dWPKo18" target="_blank" rel="noreferrer">Отвори в Google Maps</a></Button>
        <Button asChild variant="outline" className="h-12 rounded-xl border-white/10 bg-white/5 text-white/80 hover:bg-white/10 hover:text-white"><a href="tel:+359884897264">Обади се</a></Button>
      </div>
    </section>
  )
}
