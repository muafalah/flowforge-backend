export interface RequestUser {
  userId: string;
  name: string;
  email: string;
}

export interface OrganizationMemberInfo {
  id: string;
  organizationId: string;
  userId: string;
  role: string;
}
