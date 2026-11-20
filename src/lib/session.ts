import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getBusiness, getUser } from "@/lib/db";
import { canAccess, type Business, type Lang, type PublicUser, type TeamRole } from "@/lib/model";

export type Ctx = { user: PublicUser; business: Business; role: TeamRole; lang: Lang; can: (key: string) => boolean };

async function load(records: boolean) {
  const session = await auth();
  const user = session?.user?.id ? await getUser(session.user.id) : null;
  const business = user ? await getBusiness(user.businessId, { records }) : null;
  if (!user || !business) return null;
  const role = business.roles.find((r) => r.id === user.roleId) ?? { id: user.roleId, name: user.roleId, access: [] };
  const lang = user.prefs?.lang ?? business.language ?? "en";
  return { user, business, role, lang, can: (k: string) => canAccess(role, k) };
}

/** Signed-in user, their business and role, read fresh on every request so role changes apply at once. */
export async function getCtx(opts: { allowOnboarding?: boolean; records?: boolean } = {}): Promise<Ctx> {
  const ctx = await load(opts.records ?? true);
  if (!ctx) redirect("/signout");
  if (!ctx.business.onboarded && !opts.allowOnboarding) redirect("/onboarding");
  return ctx;
}

/** For pages: bounce to the dashboard when the role can't open this area. */
export async function requireArea(key: string, opts: { records?: boolean } = {}): Promise<Ctx> {
  const ctx = await getCtx(opts);
  if (!ctx.can(key)) redirect(`/dashboard?denied=${encodeURIComponent(key)}`);
  return ctx;
}

/** For server actions: throw instead of redirect. Records are only loaded when asked. */
export async function actionCtx(key?: string, opts: { records?: boolean; read?: boolean } = {}): Promise<Ctx> {
  const ctx = await load(opts.records ?? false);
  if (!ctx) throw new Error("Please sign in again.");
  if (key && !ctx.can(key)) throw new Error("Your role doesn't have access to this.");
  // a view-only role (accountant, auditor) may look at business data but not change it; own-account actions pass no key
  if (key && ctx.role.readonly && !opts.read) throw new Error("Your role is view-only, so this can't be changed.");
  return ctx;
}
