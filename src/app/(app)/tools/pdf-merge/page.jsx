// src/app/(app)/tools/pdf-merge/page.jsx
import { PageHeader } from "@/components/ui/misc";
import { PdfMergeTool } from "@/components/tools/pdf-merge";
import { getTool } from "@/lib/tools";

const tool = getTool("pdf-merge");
export const metadata = { title: tool.name };

export default function Page() {
  return (
    <>
      <PageHeader title={tool.name} bangla={tool.bangla} description={tool.description} />
      <PdfMergeTool />
    </>
  );
}
