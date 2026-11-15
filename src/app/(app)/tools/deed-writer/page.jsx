// src/app/(app)/tools/deed-writer/page.jsx
import { PageHeader } from "@/components/ui/misc";
import { DeedWriterTool } from "@/components/tools/deed-writer";
import { getTool } from "@/lib/tools";

const tool = getTool("deed-writer");
export const metadata = { title: tool.name };

export default function Page() {
    return (
        <>
            <PageHeader title={tool.name} bangla={tool.bangla} description={tool.description} />
            <DeedWriterTool />
        </>
    );
}