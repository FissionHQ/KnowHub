import { Sidebar } from "@/components/layout/Sidebar";
import { NewPageView } from "./NewPageView";

interface Props {
  params: Promise<{ spaceSlug: string }>;
}

export default async function NewPageRoute({ params }: Props) {
  const { spaceSlug } = await params;

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <main
        className="flex-1 overflow-y-auto"
        style={{ marginLeft: "var(--sidebar-width)" }}
      >
        <NewPageView spaceSlug={spaceSlug} />
      </main>
    </div>
  );
}
