import { z } from 'zod';

export const refreshTokenSchema = z.object({
  refreshToken: z
    .string({ error: 'Refresh token is required.' })
    .min(1, 'Refresh token is required.'),
});

export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
