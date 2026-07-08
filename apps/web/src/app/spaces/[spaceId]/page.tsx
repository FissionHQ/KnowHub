import { Sidebar } from "@/components/layout/Sidebar";
import { SpaceView } from "./SpaceView";

interface Props {
  params: Promise<{ spaceId: string }>;
}

export default async function SpacePage({ params }: Props) {
  const { spaceId } = await params;
  return (
    <div className="flex h-screen bg-zinc-50 dark:bg-zinc-950">
      <Sidebar />
      <main
        className="flex-1 overflow-y-auto"
        style={{ marginLeft: "var(--sidebar-width)" }}
      >
        <SpaceView spaceId={spaceId} />
      </main>
    </div>
  );
}
