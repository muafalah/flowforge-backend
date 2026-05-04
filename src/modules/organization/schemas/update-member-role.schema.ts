import { z } from 'zod';
import { OrganizationRole } from '@prisma/client';

export const updateMemberRoleSchema = z.object({
  role: z.enum([OrganizationRole.ADMIN, OrganizationRole.MEMBER], {
    error:
      'Role must be either ADMIN or MEMBER. Use transfer-ownership endpoint to promote to OWNER.',
  }),
});

export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>;
