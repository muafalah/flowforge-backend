import { z } from 'zod';

export const findMemberByUserParamsSchema = z.object({
  id: z.string().uuid('Organization ID must be a valid UUID.'),
  userId: z.string().uuid('User ID must be a valid UUID.'),
});

export type FindMemberByUserParamsInput = z.infer<
  typeof findMemberByUserParamsSchema
>;
