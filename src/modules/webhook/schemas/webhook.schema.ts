import { z } from 'zod';

export const createWebhookSchema = z.object({
  name: z.string().min(1, 'Webhook name is required.').max(100),
  description: z.string().max(500).optional(),
});

export type CreateWebhookInput = z.infer<typeof createWebhookSchema>;

export const updateWebhookSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  isActive: z.boolean().optional(),
  regenerateSecret: z.boolean().optional(),
});

export type UpdateWebhookInput = z.infer<typeof updateWebhookSchema>;
