import { z } from 'zod';

export const runQueryParamsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  status: z
    .enum(['PENDING', 'RUNNING', 'SUCCESS', 'FAILED', 'CANCELLED'])
    .optional(),
  triggerType: z.enum(['MANUAL', 'CRON', 'WEBHOOK']).optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type RunQueryParamsInput = z.infer<typeof runQueryParamsSchema>;

export const logQueryParamsSchema = z.object({
  nodeId: z.string().optional(),
  level: z.enum(['INFO', 'WARN', 'ERROR']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

export type LogQueryParamsInput = z.infer<typeof logQueryParamsSchema>;
