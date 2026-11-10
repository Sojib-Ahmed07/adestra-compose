// src/app/(app)/tools/id-card-print/page.jsx
import { PageHeader } from "@/components/ui/misc";
import { IdCardPrintTool } from "@/components/tools/id-card-print";
import { getTool } from "@/lib/tools";

const tool = getTool("id-card-print");
export const metadata = { title: tool.name };

export default function Page() {
  return (
    <>
      <PageHeader title={tool.name} bangla={tool.bangla} description={tool.description} />
      <IdCardPrintTool />
    </>
  );
}
