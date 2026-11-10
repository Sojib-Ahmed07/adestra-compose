// src/app/(app)/tools/image-resize/page.jsx
import { PageHeader } from "@/components/ui/misc";
import { ImageResizeTool } from "@/components/tools/image-resize";
import { getTool } from "@/lib/tools";

const tool = getTool("image-resize");
export const metadata = { title: tool.name };

export default function Page() {
  return (
    <>
      <PageHeader title={tool.name} bangla={tool.bangla} description={tool.description} />
      <ImageResizeTool />
    </>
  );
}
