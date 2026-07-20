// Static permission catalog for the guest-app operator dashboard. Kept
// entirely separate from the website RBAC (Permission table) and the
// mobile app's AdminPermissionSet grants, so editing these can never
// affect the website or the app.

export interface AppPermissionDef {
  code: string;
  label: string;
  group: string;
  ordering: number;
}

export const APP_PERMISSIONS: AppPermissionDef[] = [
  { code: "app.guests.view", group: "Guests", label: "View guests and check-ins", ordering: 0 },
  { code: "app.guests.manage", group: "Guests", label: "Check guests in and out", ordering: 1 },
  { code: "app.handbook.manage", group: "Content", label: "Manage handbook documents", ordering: 2 },
  { code: "app.terms.manage", group: "Content", label: "Manage terms & conditions", ordering: 3 },
  { code: "app.staff.manage", group: "Team", label: "Manage staff members", ordering: 4 },
  { code: "app.access.manage", group: "Team", label: "Manage roles and access", ordering: 5 },
];

// Roles the operator manages in this dashboard. Real UserRole values;
// Guest and Super-User are intentionally not listed here.
export const APP_MANAGED_ROLES: { role: string; label: string }[] = [
  { role: "ADMIN", label: "Property Manager" },
  { role: "STAFF", label: "Staff" },
  { role: "SUPPLIER", label: "Supplier" },
];

// Starting permissions per role, seeded once if a role has no app-permission
// rows yet. Never overwrites later operator edits.
export const APP_ROLE_DEFAULTS: Record<string, string[]> = {
  ADMIN: APP_PERMISSIONS.map((p) => p.code),
  STAFF: ["app.guests.view", "app.guests.manage"],
  SUPPLIER: ["app.guests.view"],
};
