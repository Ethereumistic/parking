import { getAuthUserId } from '@convex-dev/auth/server'
import { mutation, query } from './_generated/server'
import { v } from 'convex/values'

const CONFIG_KEY = 'parking-smokinya'

const fallbackConfig = {
  siteName: 'Parking Smokinya', currency: '€', activeYear: 2026,
  seasonStart: '2026-06-20', seasonEnd: '2026-09-20', regularMaxNights: 9, subscriptionMinNights: 10,
  regular: { dayStart: '07:30', nightStart: '19:30', rates: { low: { day: 5, night: 3 }, high: { day: 10, night: 5 } } },
  subscription: { tiers: [
    { minNights: 10, maxNights: 29, rates: { low: 7, high: 10 }, labelBg: '10–29 нощувки' },
    { minNights: 30, maxNights: 59, rates: { low: 6, high: 6 }, labelBg: '30–59 нощувки' },
    { minNights: 60, maxNights: null, rates: { low: 5, high: 5 }, labelBg: '60+ нощувки' },
  ] },
  seasons: [
    { id: 'low-early', type: 'low', labelBg: 'Нисък сезон', start: '2026-06-20', end: '2026-07-20' },
    { id: 'high', type: 'high', labelBg: 'Висок сезон', start: '2026-07-21', end: '2026-08-20' },
    { id: 'low-late', type: 'low', labelBg: 'Нисък сезон', start: '2026-08-21', end: '2026-09-20' },
  ],
}

async function requireAdmin(ctx: any) {
  const userId = await getAuthUserId(ctx)
  if (!userId) throw new Error('Not authenticated')
  const user = await ctx.db.get(userId)
  const email = (user?.email ?? '').toLowerCase()
  const allowlist = (process.env.ADMIN_EMAIL_ALLOWLIST ?? '').split(',').map((e: string) => e.trim().toLowerCase()).filter(Boolean)
  if (!email || !allowlist.includes(email)) throw new Error('Unauthorized')
  return email
}

async function latest(ctx: any, status: 'draft' | 'published') {
  const rows = await ctx.db.query('parkingConfigs').withIndex('by_key_status', (q: any) => q.eq('key', CONFIG_KEY).eq('status', status)).collect()
  return rows.sort((a: any, b: any) => b.version - a.version)[0] ?? null
}

export const getPublished = query({ args: {}, handler: async (ctx) => (await latest(ctx, 'published'))?.config ?? fallbackConfig })
export const adminGet = query({ args: {}, handler: async (ctx) => { await requireAdmin(ctx); return { draft: await latest(ctx, 'draft'), published: await latest(ctx, 'published'), fallback: fallbackConfig } } })

export const saveDraft = mutation({
  args: { config: v.any() },
  handler: async (ctx, args) => {
    const email = await requireAdmin(ctx)
    const existing = await latest(ctx, 'draft')
    const now = Date.now()
    if (existing) return await ctx.db.patch(existing._id, { config: args.config, updatedBy: email, updatedAt: now })
    const published = await latest(ctx, 'published')
    return await ctx.db.insert('parkingConfigs', { key: CONFIG_KEY, status: 'draft', version: (published?.version ?? 0) + 1, config: args.config, updatedBy: email, updatedAt: now })
  },
})

export const publishDraft = mutation({
  args: {},
  handler: async (ctx) => {
    const email = await requireAdmin(ctx)
    const draft = await latest(ctx, 'draft')
    if (!draft) throw new Error('No draft to publish')
    const now = Date.now()
    await ctx.db.insert('parkingConfigs', { key: CONFIG_KEY, status: 'published', version: draft.version, config: draft.config, updatedBy: email, updatedAt: now, publishedAt: now })
    await ctx.db.delete(draft._id)
  },
})

export const seedDraft = mutation({
  args: {},
  handler: async (ctx) => {
    const email = await requireAdmin(ctx)
    if (await latest(ctx, 'draft')) return
    const published = await latest(ctx, 'published')
    await ctx.db.insert('parkingConfigs', {
      key: CONFIG_KEY,
      status: 'draft',
      version: (published?.version ?? 0) + 1,
      config: published?.config ?? fallbackConfig,
      updatedBy: email,
      updatedAt: Date.now(),
    })
  },
})
