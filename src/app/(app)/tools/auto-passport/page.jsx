// src/app/(app)/tools/auto-passport/page.jsx
import { PageHeader } from "@/components/ui/misc";
import { AutoPassportTool } from "@/components/tools/auto-passport";
import { getTool } from "@/lib/tools";

const tool = getTool("auto-passport");
export const metadata = { title: tool.name };

export default function Page() {
  return (
    <>
      <PageHeader title={tool.name} bangla={tool.bangla} description={tool.description} />
      <AutoPassportTool />
    </>
  );
}
