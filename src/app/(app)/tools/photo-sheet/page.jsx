// src/app/(app)/tools/photo-sheet/page.jsx
import { PageHeader } from "@/components/ui/misc";
import { PhotoSheetTool } from "@/components/tools/photo-sheet";
import { getTool } from "@/lib/tools";

const tool = getTool("photo-sheet");
export const metadata = { title: tool.name };

export default function Page() {
  return (
    <>
      <PageHeader title={tool.name} bangla={tool.bangla} description={tool.description} />
      <PhotoSheetTool />
    </>
  );
}
