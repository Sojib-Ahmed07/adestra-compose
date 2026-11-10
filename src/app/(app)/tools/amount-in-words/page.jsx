// src/app/(app)/tools/amount-in-words/page.jsx
import { PageHeader } from "@/components/ui/misc";
import { AmountInWordsTool } from "@/components/tools/amount-in-words";
import { getTool } from "@/lib/tools";

const tool = getTool("amount-in-words");
export const metadata = { title: tool.name };

export default function Page() {
  return (
    <>
      <PageHeader title={tool.name} bangla={tool.bangla} description={tool.description} />
      <AmountInWordsTool />
    </>
  );
}
