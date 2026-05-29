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
})

export const CommentFeedbackSchema = z.object({
  comment: z.string().min(3, 'Must be at least 3 characters'),
})

export type CommentFeedbackSchemaOutput = z.output<typeof CommentFeedbackSchema>
