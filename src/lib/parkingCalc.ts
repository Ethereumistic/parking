import type { ParkingConfig, PeriodType, SeasonType } from './parkingConfig'

const DAY_MS = 86400000
const BG_MONTHS = ['Яну', 'Фев', 'Мар', 'Апр', 'Май', 'Юни', 'Юли', 'Авг', 'Сеп', 'Окт', 'Ное', 'Дек']

function parts(date: string) { const [y, m, d] = date.split('-').map(Number); return { y, m, d } }
function timeParts(time: string) { const [h, min] = time.split(':').map(Number); return { h, min } }
function naiveMs(date: string, time = '00:00') { const p = parts(date), t = timeParts(time); return Date.UTC(p.y, p.m - 1, p.d, t.h, t.min) }
function dateOnlyMs(date: string) { const p = parts(date); return Date.UTC(p.y, p.m - 1, p.d) }
function isoFromMs(ms: number) { const d = new Date(ms); return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}` }
function minutes(time: string) { const t = timeParts(time); return t.h * 60 + t.min }
export function fmtDate(ms: number) { const d = new Date(ms); return `${d.getUTCDate()} ${BG_MONTHS[d.getUTCMonth()]}` }
export function fmtTime(ms: number) { const d = new Date(ms); return `${String(d.getUTCHours()).padStart(2,'0')}:${String(d.getUTCMinutes()).padStart(2,'0')}` }
export function dayWord(n: number) { return n === 1 ? '1 ден' : `${n} дни` }

export function nightsBetween(arrDate: string, depDate: string) { return Math.round((dateOnlyMs(depDate) - dateOnlyMs(arrDate)) / DAY_MS) }

export function getSeason(config: ParkingConfig, date: string): SeasonType | null {
  const t = dateOnlyMs(date)
  const s = config.seasons.find((x) => t >= dateOnlyMs(x.start) && t <= dateOnlyMs(x.end))
  return s?.type ?? null
}

function intervalStartOf(config: ParkingConfig, ms: number) {
  const d = new Date(ms)
  const mod = d.getUTCHours() * 60 + d.getUTCMinutes()
  const dayStart = minutes(config.regular.dayStart)
  const nightStart = minutes(config.regular.nightStart)
  const y = d.getUTCFullYear(), m = d.getUTCMonth(), day = d.getUTCDate()
  if (mod >= dayStart && mod < nightStart) return Date.UTC(y, m, day, Math.floor(dayStart / 60), dayStart % 60)
  if (mod >= nightStart) return Date.UTC(y, m, day, Math.floor(nightStart / 60), nightStart % 60)
  return Date.UTC(y, m, day - 1, Math.floor(nightStart / 60), nightStart % 60)
}
function nextIntervalStart(config: ParkingConfig, ms: number) {
  const d = new Date(ms), mod = d.getUTCHours() * 60 + d.getUTCMinutes(), dayStart = minutes(config.regular.dayStart), nightStart = minutes(config.regular.nightStart)
  if (mod === dayStart) return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), Math.floor(nightStart / 60), nightStart % 60)
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, Math.floor(dayStart / 60), dayStart % 60)
}
function periodOf(config: ParkingConfig, ms: number): PeriodType { const d = new Date(ms); return d.getUTCHours() * 60 + d.getUTCMinutes() === minutes(config.regular.dayStart) ? 'day' : 'night' }

export function calculateRegular(config: ParkingConfig, arrDate: string, arrTime: string, depDate: string, depTime: string) {
  if (!arrDate || !depDate) return { ok: false as const, message: 'Изберете дата и час за изчисление…' }
  const arrMs = naiveMs(arrDate, arrTime || '00:00'), depMs = naiveMs(depDate, depTime || '00:00')
  if (depMs <= arrMs) return { ok: false as const, message: 'Датата/часът на заминаване трябва да е след пристигането.' }
  const nights = nightsBetween(arrDate, depDate)
  for (let t = dateOnlyMs(arrDate); t <= dateOnlyMs(depDate); t += DAY_MS) if (!getSeason(config, isoFromMs(t))) return { ok: false as const, message: `Избраният период излиза извън летния сезон (${config.seasonStart} – ${config.seasonEnd}).` }
  if (nights >= config.subscriptionMinNights) return { ok: false as const, switchMode: 'subscription' as const, nights, message: 'Редовното ценообразуване е за до 9 нощувки.' }
  const intervals = [] as Array<{ startMs: number; endMs: number; period: PeriodType; season: SeasonType; rate: number }>
  let cur = intervalStartOf(config, arrMs)
  while (cur < depMs) {
    const next = nextIntervalStart(config, cur), period = periodOf(config, cur), season = getSeason(config, isoFromMs(cur)) ?? 'low', rate = config.regular.rates[season][period]
    intervals.push({ startMs: cur, endMs: Math.min(next, depMs), period, season, rate }); cur = next
  }
  const total = intervals.reduce((s, r) => s + r.rate, 0)
  return { ok: true as const, mode: 'regular' as const, intervals, total, nights }
}

export function calculateSubscription(config: ParkingConfig, arrDate: string, depDate: string) {
  if (!arrDate || !depDate) return { ok: false as const, message: 'Изберете минимум 10 дни за изчисление…' }
  const totalDays = nightsBetween(arrDate, depDate)
  if (totalDays <= 0) return { ok: false as const, message: 'Датата на заминаване трябва да е след пристигането.' }
  for (let i = 0; i < totalDays; i++) if (!getSeason(config, isoFromMs(dateOnlyMs(arrDate) + i * DAY_MS))) return { ok: false as const, message: `Избраният период излиза извън летния сезон (${config.seasonStart} – ${config.seasonEnd}).` }
  if (totalDays < config.subscriptionMinNights) return { ok: false as const, switchMode: 'regular' as const, totalDays, message: 'Минималният период за абонамент е 10 дни.' }
  const tier = config.subscription.tiers.find((t) => totalDays >= t.minNights && (t.maxNights == null || totalDays <= t.maxNights)) ?? config.subscription.tiers[0]
  let lowDays = 0, highDays = 0
  for (let i = 0; i < totalDays; i++) (getSeason(config, isoFromMs(dateOnlyMs(arrDate) + i * DAY_MS)) === 'low' ? lowDays++ : highDays++)
  const rows = [
    lowDays ? { label: 'Нисък сезон', days: lowDays, rate: tier.rates.low, amount: lowDays * tier.rates.low, season: 'low' as SeasonType } : null,
    highDays ? { label: 'Висок сезон', days: highDays, rate: tier.rates.high, amount: highDays * tier.rates.high, season: 'high' as SeasonType } : null,
  ].filter(Boolean) as Array<{ label: string; days: number; rate: number; amount: number; season: SeasonType }>
  const total = rows.reduce((s, r) => s + r.amount, 0)
  return { ok: true as const, mode: 'subscription' as const, totalDays, tier, rows, total, effective: (total / totalDays).toFixed(2) }
}
