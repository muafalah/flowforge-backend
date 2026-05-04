import { z } from 'zod';

export const createWorkflowSchema = z.object({
  name: z
    .string({ error: 'Workflow name is required.' })
    .min(3, 'Workflow name must be at least 3 characters.')
    .max(100, 'Workflow name must be at most 100 characters.'),
  description: z
    .string()
    .max(500, 'Description must be at most 500 characters.')
    .optional(),
  access: z.enum(['EDITOR', 'VIEWER']).default('EDITOR'),
});

export type CreateWorkflowInput = z.infer<typeof createWorkflowSchema>;
