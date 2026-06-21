import { v } from 'convex/values'
import { getAuthUserId } from '@convex-dev/auth/server'
import { mutation, query } from './_generated/server'

async function requireAdmin(ctx: any) {
  const userId = await getAuthUserId(ctx)
  if (!userId) throw new Error('Not authenticated')
  const user = await ctx.db.get(userId)
  const allowlist = (process.env.ADMIN_EMAIL_ALLOWLIST ?? '')
    .split(',')
    .map((email: string) => email.trim().toLowerCase())
    .filter(Boolean)
  const email = (user?.email ?? '').toLowerCase()
  if (!email || !allowlist.includes(email)) throw new Error('Unauthorized')
  return { userId, email }
}

export const listSignals = query({
  args: { roomId: v.string(), since: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx)
    const cutoff = args.since ?? Date.now() - 2 * 60 * 1000
    return await ctx.db
      .query('videoSignals')
      .withIndex('by_room_created', (q) => q.eq('roomId', args.roomId).gte('createdAt', cutoff))
      .order('asc')
      .take(200)
  },
})

export const sendSignal = mutation({
  args: {
    roomId: v.string(),
    from: v.string(),
    type: v.union(v.literal('offer'), v.literal('answer'), v.literal('candidate'), v.literal('presence'), v.literal('bye')),
    payload: v.any(),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx)
    await ctx.db.insert('videoSignals', { ...args, createdAt: Date.now() })
  },
})

export const cleanupSignals = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx)
    const cutoff = Date.now() - 5 * 60 * 1000
    const old = await ctx.db.query('videoSignals').withIndex('by_created', (q) => q.lt('createdAt', cutoff)).take(100)
    await Promise.all(old.map((row) => ctx.db.delete(row._id)))
  },
})
