// src/app/(app)/tools/remove-bg/page.jsx
import { PageHeader } from "@/components/ui/misc";
import { RemoveBgTool } from "@/components/tools/remove-bg";
import { getTool } from "@/lib/tools";

const tool = getTool("remove-bg");
export const metadata = { title: tool.name };

export default function Page() {
  return (
    <>
      <PageHeader title={tool.name} bangla={tool.bangla} description={tool.description} />
      <RemoveBgTool />
    </>
  );
}
