import { Sidebar } from "@/components/layout/Sidebar";
import { SpacesList } from "./SpacesList";

export default function SpacesPage() {
  return (
    <div className="flex h-screen bg-zinc-50 dark:bg-zinc-950">
      <Sidebar />
      <main
        className="flex-1 overflow-y-auto"
        style={{ marginLeft: "var(--sidebar-width)" }}
      >
        <div className="max-w-5xl mx-auto px-8 py-10">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">All Spaces</h1>
            <p className="text-zinc-500 dark:text-zinc-400 text-sm mt-1">Browse and navigate your knowledge base</p>
          </div>
          <SpacesList />
        </div>
      </main>
    </div>
  );
}
