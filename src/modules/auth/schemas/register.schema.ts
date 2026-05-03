import { z } from 'zod';

export const registerSchema = z.object({
  name: z
    .string({ error: 'Name is required.' })
    .min(1, 'Name is required.')
    .max(100, 'Name must be at most 100 characters.'),
  email: z
    .string({ error: 'Email is required.' })
    .email('Email format is invalid.'),
  password: z
    .string({ error: 'Password is required.' })
    .min(8, 'Password must be at least 8 characters long.'),
});

export type RegisterInput = z.infer<typeof registerSchema>;
