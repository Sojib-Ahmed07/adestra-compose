// src/app/(app)/settings/page.jsx
import { requireUser } from "@/server/session";
import { getShop, getTeam } from "@/server/queries/settings";
import { PageHeader } from "@/components/ui/misc";
import { SettingsView } from "@/components/settings/settings-view";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireUser();
  const isOwner = user.role === "owner";
  const [shop, team] = await Promise.all([getShop(), isOwner ? getTeam() : Promise.resolve([])]);
  return (
    <>
      <PageHeader
        title="Settings"
        description={isOwner ? "Shop details, who can sign in, and your password." : "Change your password."}
      />
      <SettingsView
        isOwner={isOwner}
        me={user}
        shop={shop}
        team={team.map((m) => ({ ...m, createdAt: m.createdAt.toISOString() }))}
      />
    </>
  );
}
