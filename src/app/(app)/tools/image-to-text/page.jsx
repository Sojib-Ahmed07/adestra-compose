// src/app/(app)/tools/image-to-text/page.jsx
import { PageHeader } from "@/components/ui/misc";
import { ImageToTextTool } from "@/components/tools/image-to-text";
import { getTool } from "@/lib/tools";

const tool = getTool("image-to-text");
export const metadata = { title: tool.name };

export default function Page() {
  return (
    <>
      <PageHeader title={tool.name} bangla={tool.bangla} description={tool.description} />
      <ImageToTextTool />
    </>
  );
}
