import { z } from 'zod'

export interface ThumbsFeedbackResponse {
  thumbs: 'up' | 'down'
  stats: {
    up: number
    down: number
  }
}

export const ThumbsFeedbackSchema = z.object({
  thumbs: z.enum(['up', 'down']),
  toolId: z.string().optional(),
  context: z.record(z.string(), z.unknown()).optional(),
})

export const CommentFeedbackSchema = z.object({
  comment: z.string().min(3, 'Must be at least 3 characters'),
  toolId: z.string().optional(),
  context: z.record(z.string(), z.unknown()).optional(),
})

export type CommentFeedbackSchemaOutput = z.output<typeof CommentFeedbackSchema>
