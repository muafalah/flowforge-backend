import { z } from 'zod';

export const addMemberSchema = z.object({
  email: z
    .string({ error: 'Email is required.' })
    .email('Email format is invalid.'),
});

export type AddMemberInput = z.infer<typeof addMemberSchema>;
