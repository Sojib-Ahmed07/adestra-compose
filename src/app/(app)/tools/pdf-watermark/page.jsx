// src/app/(app)/tools/pdf-watermark/page.jsx
import { PageHeader } from "@/components/ui/misc";
import { PdfWatermarkTool } from "@/components/tools/pdf-watermark";
import { getTool } from "@/lib/tools";

const tool = getTool("pdf-watermark");
export const metadata = { title: tool.name };

export default function Page() {
  return (
    <>
      <PageHeader title={tool.name} bangla={tool.bangla} description={tool.description} />
      <PdfWatermarkTool />
    </>
  );
}
