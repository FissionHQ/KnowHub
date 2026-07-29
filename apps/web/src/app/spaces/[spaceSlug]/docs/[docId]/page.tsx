import { Sidebar } from "@/components/layout/Sidebar";
import { DocumentView } from "./DocumentView";

interface Props {
  params: Promise<{ spaceSlug: string; docId: string }>;
}

export default async function DocumentPage({ params }: Props) {
  const { spaceSlug, docId } = await params;
  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <main
        className="flex-1 overflow-y-auto"
        style={{ marginLeft: "var(--sidebar-width)" }}
      >
        <DocumentView spaceSlug={spaceSlug} docId={docId} />
      </main>
    </div>
  );
}
