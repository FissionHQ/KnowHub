import { Sidebar } from "@/components/layout/Sidebar";
import { VersionsView } from "./VersionsView";

interface Props {
  params: Promise<{ spaceSlug: string; docSlug: string }>;
}

export default async function VersionsPage({ params }: Props) {
  const { spaceSlug, docSlug } = await params;
  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <main className="flex-1 overflow-y-auto" style={{ marginLeft: "var(--sidebar-width)" }}>
        <VersionsView spaceSlug={spaceSlug} docSlug={docSlug} />
      </main>
    </div>
  );
}
