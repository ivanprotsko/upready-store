import type { TenantAdminRole } from "../../../modules/tenant/models/tenant-admin";

type StaffMemberRow = {
  id: string;
  email: string;
  first_name?: string | null;
  last_name?: string | null;
  role: TenantAdminRole;
  created_at: Date | string;
  updated_at: Date | string;
};

/**
 * One login as `/tenants/staff` answers it. Field by field on purpose: the row
 * is never spread into a response, so a column added to `tenant_admin` later
 * does not reach the panel by accident.
 */
export const toStaffMember = (row: StaffMemberRow, callerId: string) => ({
  id: row.id,
  email: row.email,
  first_name: row.first_name ?? null,
  last_name: row.last_name ?? null,
  role: row.role,
  created_at: row.created_at,
  updated_at: row.updated_at,
  is_self: row.id === callerId,
});
