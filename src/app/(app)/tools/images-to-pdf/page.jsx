// src/app/(app)/tools/images-to-pdf/page.jsx
import { PageHeader } from "@/components/ui/misc";
import { ImagesToPdfTool } from "@/components/tools/images-to-pdf";
import { getTool } from "@/lib/tools";

const tool = getTool("images-to-pdf");
export const metadata = { title: tool.name };

export default function Page() {
  return (
    <>
      <PageHeader title={tool.name} bangla={tool.bangla} description={tool.description} />
      <ImagesToPdfTool />
    </>
  );
}
