// src/app/(app)/tools/pdf-split/page.jsx
import { PageHeader } from "@/components/ui/misc";
import { PdfSplitTool } from "@/components/tools/pdf-split";
import { getTool } from "@/lib/tools";

const tool = getTool("pdf-split");
export const metadata = { title: tool.name };

export default function Page() {
  return (
    <>
      <PageHeader title={tool.name} bangla={tool.bangla} description={tool.description} />
      <PdfSplitTool />
    </>
  );
}
