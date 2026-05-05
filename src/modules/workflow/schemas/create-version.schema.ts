import { z } from 'zod';
import { dagDefinitionSchema } from '../utils/dag-validator';

export const createVersionSchema = z.object({
  definition: dagDefinitionSchema,
});

export type CreateVersionInput = z.infer<typeof createVersionSchema>;
