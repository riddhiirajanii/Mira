export function hasPermission(userRole: string, action: string) {
  return userRole === 'admin' || action === 'read';
}
