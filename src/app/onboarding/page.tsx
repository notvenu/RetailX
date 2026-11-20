import { redirect } from "next/navigation";
import { getCtx } from "@/lib/session";
import { Wizard } from "@/components/onboarding/Wizard";

export const metadata = { title: "Set up your business · RetailX" };

export default async function OnboardingPage() {
  const { user, business } = await getCtx({ allowOnboarding: true });
  if (business.onboarded) redirect("/dashboard");
  if (user.roleId !== "owner") redirect("/signout");
  return <Wizard businessId={business.id} businessName={business.name} ownerName={user.name} />;
}
