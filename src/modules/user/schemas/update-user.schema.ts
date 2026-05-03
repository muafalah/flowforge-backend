import { z } from 'zod';

export const updateUserSchema = z.object({
  name: z
    .string({ error: 'Name must be a string.' })
    .min(1, 'Name is required.')
    .max(100, 'Name must be at most 100 characters.'),
});

export type UpdateUserInput = z.infer<typeof updateUserSchema>;
