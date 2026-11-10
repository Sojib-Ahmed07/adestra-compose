// src/app/(app)/tools/joint-photo/page.jsx
import { PageHeader } from "@/components/ui/misc";
import { JointPhotoTool } from "@/components/tools/joint-photo";
import { getTool } from "@/lib/tools";

const tool = getTool("joint-photo");
export const metadata = { title: tool.name };

export default function Page() {
  return (
    <>
      <PageHeader title={tool.name} bangla={tool.bangla} description={tool.description} />
      <JointPhotoTool />
    </>
  );
}
