import { z } from 'zod';

export const activityLogQueryParamsSchema = z.object({
  page: z.coerce
    .number()
    .int()
    .positive('Page must be a positive integer.')
    .default(1),
  limit: z.coerce
    .number()
    .int()
    .positive('Limit must be a positive integer.')
    .max(100, 'Limit must be at most 100.')
    .default(20),
  search: z.string().optional(),
  action: z.string().optional(),
  actorId: z.string().uuid().optional(),
  targetType: z.string().optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type ActivityLogQueryParamsInput = z.infer<
  typeof activityLogQueryParamsSchema
>;
