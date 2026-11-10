// src/app/(app)/tools/pdf-to-images/page.jsx
import { PageHeader } from "@/components/ui/misc";
import { PdfToImagesTool } from "@/components/tools/pdf-to-images";
import { getTool } from "@/lib/tools";

const tool = getTool("pdf-to-images");
export const metadata = { title: tool.name };

export default function Page() {
  return (
    <>
      <PageHeader title={tool.name} bangla={tool.bangla} description={tool.description} />
      <PdfToImagesTool />
    </>
  );
}
