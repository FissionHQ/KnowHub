import { Sidebar } from "@/components/layout/Sidebar";
import { VersionsView } from "./VersionsView";

interface Props {
  params: Promise<{ spaceId: string; docId: string }>;
}

export default async function VersionsPage({ params }: Props) {
  const { spaceId, docId } = await params;
  return (
    <div className="flex h-screen bg-zinc-50 dark:bg-zinc-950">
      <Sidebar />
      <main className="flex-1 overflow-y-auto" style={{ marginLeft: "var(--sidebar-width)" }}>
        <VersionsView spaceId={spaceId} docId={docId} />
      </main>
    </div>
  );
}
