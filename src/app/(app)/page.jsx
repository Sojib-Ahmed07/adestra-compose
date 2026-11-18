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
        description="Pick a tool. Photos are processed in the browser (only the optional Best background removal sends them to the shop's Cloudflare account)."
      />
      <ToolHub />
    </>
  );
}