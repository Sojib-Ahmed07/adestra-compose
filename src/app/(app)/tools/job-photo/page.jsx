// src/app/(app)/tools/job-photo/page.jsx
import { PageHeader } from "@/components/ui/misc";
import { JobPhotoTool } from "@/components/tools/job-photo";
import { getTool } from "@/lib/tools";

const tool = getTool("job-photo");
export const metadata = { title: tool.name };

export default function Page() {
  return (
    <>
      <PageHeader title={tool.name} bangla={tool.bangla} description={tool.description} />
      <JobPhotoTool />
    </>
  );
}
