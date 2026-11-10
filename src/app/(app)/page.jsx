// src/app/(app)/page.jsx
import { getShop } from "@/server/queries/settings";
import { PageHeader } from "@/components/ui/misc";
import { ToolHub } from "@/components/shell/tool-hub";

export const metadata = { title: "All tools" };

export default async function HomePage() {
  const shop = await getShop();
  return (
    <>
      <PageHeader
        title={shop.name}
        description="Pick a tool. Photos never leave this computer — everything is processed in the browser."
      />
      <ToolHub />
    </>
  );
}
