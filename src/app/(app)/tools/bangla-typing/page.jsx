// src/app/(app)/tools/bangla-typing/page.jsx
import { PageHeader } from "@/components/ui/misc";
import { BanglaTypingTool } from "@/components/tools/bangla-typing";
import { getTool } from "@/lib/tools";

const tool = getTool("bangla-typing");
export const metadata = { title: tool.name };

export default function Page() {
  return (
    <>
      <PageHeader title={tool.name} bangla={tool.bangla} description={tool.description} />
      <BanglaTypingTool />
    </>
  );
}
