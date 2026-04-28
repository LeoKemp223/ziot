export type OrgAccessContext = {
  isPlatformAdmin: boolean;
  orgIds: string[];
};

export function mergePermissions(rolePermissions: string[][]): string[] {
  return [...new Set(rolePermissions.flat())].sort();
}

export function canAccessOrg(
  context: OrgAccessContext,
  targetOrgId: string
): boolean {
  return context.isPlatformAdmin || context.orgIds.includes(targetOrgId);
}

export function hasPermission(
  permissions: readonly string[],
  requiredPermission: string
): boolean {
  return permissions.includes(requiredPermission);
}
