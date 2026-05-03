import { z } from 'zod';

export const loginSchema = z.object({
  email: z
    .string({ error: 'Email is required.' })
    .email('Email format is invalid.'),
  password: z
    .string({ error: 'Password is required.' })
    .min(8, 'Password must be at least 8 characters long.'),
});

export type LoginInput = z.infer<typeof loginSchema>;
