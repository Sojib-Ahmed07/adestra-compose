// src/app/(app)/tools/pdf-protect/page.jsx
import { PageHeader } from "@/components/ui/misc";
import { PdfProtectTool } from "@/components/tools/pdf-protect";
import { getTool } from "@/lib/tools";

const tool = getTool("pdf-protect");
export const metadata = { title: tool.name };

export default function Page() {
  return (
    <>
      <PageHeader title={tool.name} bangla={tool.bangla} description={tool.description} />
      <PdfProtectTool />
    </>
  );
}
