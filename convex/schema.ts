import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'
import { authTables } from '@convex-dev/auth/server'

export default defineSchema({
  ...authTables,
  parkingConfigs: defineTable({
    key: v.string(),
    status: v.union(v.literal('draft'), v.literal('published')),
    version: v.number(),
    config: v.any(),
    updatedBy: v.optional(v.string()),
    updatedAt: v.number(),
    publishedAt: v.optional(v.number()),
  })
    .index('by_key_status', ['key', 'status'])
    .index('by_status_version', ['status', 'version']),
})
