// src/app/(app)/tools/pdf-organize/page.jsx
import { PageHeader } from "@/components/ui/misc";
import { PdfOrganizeTool } from "@/components/tools/pdf-organize";
import { getTool } from "@/lib/tools";

const tool = getTool("pdf-organize");
export const metadata = { title: tool.name };

export default function Page() {
  return (
    <>
      <PageHeader title={tool.name} bangla={tool.bangla} description={tool.description} />
      <PdfOrganizeTool />
    </>
  );
}
