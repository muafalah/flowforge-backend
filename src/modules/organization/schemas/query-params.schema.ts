import { z } from 'zod';
import { OrganizationRole } from '@prisma/client';

export const queryParamsSchema = z.object({
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
  roles: z
    .union([z.string(), z.array(z.string())])
    .transform((val) => {
      const arr = Array.isArray(val) ? val : val.split(',');
      return arr.map((v) => v.trim().toUpperCase());
    })
    .pipe(z.array(z.nativeEnum(OrganizationRole)))
    .optional(),
  sortBy: z.enum(['name', 'createdAt', 'role']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type QueryParamsInput = z.infer<typeof queryParamsSchema>;
