import { convexAuth, getAuthUserId } from '@convex-dev/auth/server'
import { Password } from '@convex-dev/auth/providers/Password'
import { query } from './_generated/server'

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Password],
})

export const me = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx)
    if (!userId) return null
    const user = await ctx.db.get(userId)
    if (!user) return null
    const allowlist = (process.env.ADMIN_EMAIL_ALLOWLIST ?? '')
      .split(',')
      .map((email: string) => email.trim().toLowerCase())
      .filter(Boolean)
    const email = (user.email ?? '').toLowerCase()
    return {
      id: userId,
      email: user.email ?? null,
      name: user.name ?? null,
      isAdmin: allowlist.length > 0 && email ? allowlist.includes(email) : false,
    }
  },
})
