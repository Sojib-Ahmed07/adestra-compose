// src/app/(app)/tools/cv-maker/page.jsx
import { PageHeader } from "@/components/ui/misc";
import { CvMakerTool } from "@/components/tools/cv-maker";
import { getTool } from "@/lib/tools";

const tool = getTool("cv-maker");
export const metadata = { title: tool.name };

export default function Page() {
    return (
        <>
            <PageHeader title={tool.name} bangla={tool.bangla} description={tool.description} />
            <CvMakerTool />
        </>
    );
}