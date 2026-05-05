import { z } from 'zod';

/** Simple cron expression validator */
function isValidCron(expr: string): boolean {
  const parts = expr.trim().split(/\s+/);
  return parts.length === 5 || parts.length === 6;
}

export const createCronJobSchema = z.object({
  name: z.string().min(1, 'Cron job name is required.').max(100),
  description: z.string().max(500).optional(),
  cronExpression: z
    .string()
    .min(1, 'Cron expression is required.')
    .refine(isValidCron, 'Invalid cron expression format.'),
  timezone: z.string().default('UTC'),
});

export type CreateCronJobInput = z.infer<typeof createCronJobSchema>;

export const updateCronJobSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  cronExpression: z
    .string()
    .min(1)
    .refine(isValidCron, 'Invalid cron expression format.')
    .optional(),
  timezone: z.string().optional(),
  isActive: z.boolean().optional(),
});

export type UpdateCronJobInput = z.infer<typeof updateCronJobSchema>;
