// src/app/(app)/tools/pdf-compress/page.jsx
import { PageHeader } from "@/components/ui/misc";
import { PdfCompressTool } from "@/components/tools/pdf-compress";
import { getTool } from "@/lib/tools";

const tool = getTool("pdf-compress");
export const metadata = { title: tool.name };

export default function Page() {
  return (
    <>
      <PageHeader title={tool.name} bangla={tool.bangla} description={tool.description} />
      <PdfCompressTool />
    </>
  );
}
