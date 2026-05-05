import { z } from 'zod';

export const recentRunsQueryParamsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  status: z
    .enum(['PENDING', 'RUNNING', 'SUCCESS', 'FAILED', 'CANCELLED'])
    .optional(),
});

export type RecentRunsQueryParamsInput = z.infer<
  typeof recentRunsQueryParamsSchema
>;
