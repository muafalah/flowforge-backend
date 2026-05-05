import { z } from 'zod';

export const transferOwnershipSchema = z.object({
  memberId: z
    .string({ error: 'Member ID is required.' })
    .uuid('Member ID must be a valid UUID.'),
});

export type TransferOwnershipInput = z.infer<typeof transferOwnershipSchema>;
