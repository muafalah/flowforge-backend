import { z } from 'zod';

export const logoutSchema = z.object({
  refreshToken: z
    .string({ error: 'Refresh token is required.' })
    .min(1, 'Refresh token is required.'),
});

export type LogoutInput = z.infer<typeof logoutSchema>;
