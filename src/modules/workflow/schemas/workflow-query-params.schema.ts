import { z } from 'zod';

export const workflowQueryParamsSchema = z.object({
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
    .default(10),
  search: z.string().optional(),
  sortBy: z.enum(['name', 'createdAt']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type WorkflowQueryParamsInput = z.infer<
  typeof workflowQueryParamsSchema
>;

export const versionQueryParamsSchema = z.object({
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
    .default(10),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type VersionQueryParamsInput = z.infer<typeof versionQueryParamsSchema>;
