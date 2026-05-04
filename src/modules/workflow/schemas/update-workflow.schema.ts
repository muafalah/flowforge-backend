import { z } from 'zod';

export const updateWorkflowSchema = z.object({
  name: z
    .string()
    .min(3, 'Workflow name must be at least 3 characters.')
    .max(100, 'Workflow name must be at most 100 characters.')
    .optional(),
  description: z
    .string()
    .max(500, 'Description must be at most 500 characters.')
    .nullable()
    .optional(),
  access: z.enum(['EDITOR', 'VIEWER']).optional(),
});

export type UpdateWorkflowInput = z.infer<typeof updateWorkflowSchema>;
