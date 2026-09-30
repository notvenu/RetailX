import type { Role } from "@/lib/users";

export const ALL_ROLES: Role[] = ["Owner", "Manager", "Accountant", "Employee"];

/** Route prefix → roles allowed. Longest matching prefix wins. */
export const ACCESS: Record<string, Role[]> = {
  "/": ALL_ROLES,
  "/overview": ALL_ROLES,
  "/finance": ["Owner", "Manager", "Accountant"],
  "/sales": ALL_ROLES,
  "/inventory": ALL_ROLES,
  "/procurement": ["Owner", "Manager", "Accountant"],
  "/hr": ["Owner", "Manager"],
  "/analytics": ["Owner", "Manager", "Accountant"],
  "/forecasting": ["Owner", "Manager", "Accountant"],
  "/decision-support": ["Owner", "Manager"],
  "/branch-evaluation": ["Owner", "Manager"],
};

export function rolesForPath(pathname: string): Role[] {
  let best = "/";
  for (const prefix of Object.keys(ACCESS)) {
    if (prefix === "/") continue;
    if (
      (pathname === prefix || pathname.startsWith(prefix + "/")) &&
      prefix.length > best.length
    ) {
      best = prefix;
    }
  }
  return ACCESS[best];
}

export function canAccess(role: Role, pathname: string): boolean {
  return rolesForPath(pathname).includes(role);
}
