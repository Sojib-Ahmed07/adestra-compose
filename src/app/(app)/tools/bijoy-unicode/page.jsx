// src/app/(app)/tools/bijoy-unicode/page.jsx
import { PageHeader } from "@/components/ui/misc";
import { BijoyUnicodeTool } from "@/components/tools/bijoy-unicode";
import { getTool } from "@/lib/tools";

const tool = getTool("bijoy-unicode");
export const metadata = { title: tool.name };

export default function Page() {
  return (
    <>
      <PageHeader title={tool.name} bangla={tool.bangla} description={tool.description} />
      <BijoyUnicodeTool />
    </>
  );
}
