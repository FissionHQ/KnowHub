import { Sidebar } from "@/components/layout/Sidebar";
import { SpaceView } from "./SpaceView";

interface Props {
  params: Promise<{ spaceSlug: string }>;
}

export default async function SpacePage({ params }: Props) {
  const { spaceSlug } = await params;
  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <main
        className="flex-1 overflow-y-auto"
        style={{ marginLeft: "var(--sidebar-width)" }}
      >
        <SpaceView spaceSlug={spaceSlug} />
      </main>
    </div>
  );
}
