// src/app/(app)/tools/page-arranger/page.jsx
import { PageHeader } from "@/components/ui/misc";
import { PageArrangerTool } from "@/components/tools/page-arranger";
import { getTool } from "@/lib/tools";

const tool = getTool("page-arranger");
export const metadata = { title: tool.name };

export default function Page() {
  return (
    <>
      <PageHeader title={tool.name} bangla={tool.bangla} description={tool.description} />
      <PageArrangerTool />
    </>
  );
}
