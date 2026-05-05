import { z } from 'zod';

export const triggerRunSchema = z.object({}).strict();

export type TriggerRunInput = z.infer<typeof triggerRunSchema>;
