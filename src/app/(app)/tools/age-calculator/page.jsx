// src/app/(app)/tools/age-calculator/page.jsx
import { PageHeader } from "@/components/ui/misc";
import { AgeCalculatorTool } from "@/components/tools/age-calculator";
import { getTool } from "@/lib/tools";

const tool = getTool("age-calculator");
export const metadata = { title: tool.name };

export default function Page() {
  return (
    <>
      <PageHeader title={tool.name} bangla={tool.bangla} description={tool.description} />
      <AgeCalculatorTool />
    </>
  );
}
