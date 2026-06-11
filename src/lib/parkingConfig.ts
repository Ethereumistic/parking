export type SeasonType = 'low' | 'high'
export type PeriodType = 'day' | 'night'

export type ParkingConfig = {
  siteName: string
  currency: string
  activeYear: number
  seasonStart: string
  seasonEnd: string
  regularMaxNights: number
  subscriptionMinNights: number
  regular: {
    dayStart: string
    nightStart: string
    rates: Record<SeasonType, Record<PeriodType, number>>
  }
  subscription: {
    tiers: Array<{ minNights: number; maxNights: number | null; rates: Record<SeasonType, number>; labelBg: string }>
  }
  seasons: Array<{ id: string; type: SeasonType; labelBg: string; start: string; end: string }>
}

export const fallbackParkingConfig: ParkingConfig = {
  siteName: 'Parking Smokinya',
  currency: '€',
  activeYear: 2026,
  seasonStart: '2026-06-20',
  seasonEnd: '2026-09-20',
  regularMaxNights: 9,
  subscriptionMinNights: 10,
  regular: {
    dayStart: '07:30',
    nightStart: '19:30',
    rates: { low: { day: 5, night: 3 }, high: { day: 10, night: 5 } },
  },
  subscription: {
    tiers: [
      { minNights: 10, maxNights: 29, rates: { low: 7, high: 10 }, labelBg: '10–29 нощувки' },
      { minNights: 30, maxNights: 59, rates: { low: 6, high: 6 }, labelBg: '30–59 нощувки' },
      { minNights: 60, maxNights: null, rates: { low: 5, high: 5 }, labelBg: '60+ нощувки' },
    ],
  },
  seasons: [
    { id: 'low-early', type: 'low', labelBg: 'Нисък сезон', start: '2026-06-20', end: '2026-07-20' },
    { id: 'high', type: 'high', labelBg: 'Висок сезон', start: '2026-07-21', end: '2026-08-20' },
    { id: 'low-late', type: 'low', labelBg: 'Нисък сезон', start: '2026-08-21', end: '2026-09-20' },
  ],
}
