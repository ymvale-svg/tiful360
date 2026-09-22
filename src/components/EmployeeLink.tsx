import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import type { ReactNode } from "react";

const ALLOWED_ROLES = [
  "admin",
  "super_admin",
  "operations",
  "direct_manager",
  "payroll",
  "hr",
  "finance",
] as const;

interface Props {
  employeeId?: string | null;
  name?: ReactNode;
  className?: string;
  /** Optional tab to open inside the employee file (e.g. "assets") */
  tab?: string;
}

/**
 * Employee name that links to the employee file, wherever the name is shown.
 * Falls back to plain text when the viewer has no access to employee files.
 */
export function EmployeeLink({ employeeId, name, className, tab }: Props) {
  const { roles } = useAuth();
  const canOpen = !!employeeId && roles.some((r) => (ALLOWED_ROLES as readonly string[]).includes(r));

  if (!canOpen) return <span className={className}>{name}</span>;

  return (
    <Link
      to={`/employees/${employeeId}${tab ? `?tab=${tab}` : ""}`}
      onClick={(e) => e.stopPropagation()}
      title="פתיחת תיק העובד"
      className={cn("hover:text-primary hover:underline underline-offset-2 transition-colors", className)}
    >
      {name}
    </Link>
  );
}
