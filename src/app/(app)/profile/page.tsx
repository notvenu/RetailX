import { t } from "@/lib/i18n";
import { getCtx } from "@/lib/session";
import { emailConfigured, vapidKeys, whatsappConfigured } from "@/lib/notify";
import { PageHeader } from "@/components/ui";
import { ProfilePanel } from "@/components/ProfilePanel";

export default async function ProfilePage() {
  const { lang, user } = await getCtx({ records: false });
  return (
    <>
      <PageHeader title={t(lang, "shell.profile")} meta="Your login, verification, password and notifications." />
      <ProfilePanel
        user={{ name: user.name, email: user.email, phone: user.phone, username: user.username, emailVerified: !!user.emailVerified, phoneVerified: !!user.phoneVerified, emailNotify: !!user.prefs?.emailNotify }}
        channels={{ email: emailConfigured(), whatsapp: whatsappConfigured() }}
        pushKey={(await vapidKeys()).publicKey}
      />
    </>
  );
}
