import { z } from 'zod';

export const createOrganizationSchema = z.object({
  name: z
    .string({ error: 'Organization name is required.' })
    .min(3, 'Organization name must be at least 3 characters.')
    .max(100, 'Organization name must be at most 100 characters.'),
});

export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;
