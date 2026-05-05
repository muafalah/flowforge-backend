import { z } from 'zod';

export const generateWorkflowSchema = z.object({
  prompt: z
    .string()
    .min(10, 'Workflow description must be at least 10 characters.')
    .max(1000, 'Workflow description must not exceed 1000 characters.'),
});

export type GenerateWorkflowInput = z.infer<typeof generateWorkflowSchema>;
