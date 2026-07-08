import { Sidebar } from "@/components/layout/Sidebar";
import { SearchView } from "./SearchView";

export default function SearchPage() {
  return (
    <div className="flex h-screen bg-zinc-50 dark:bg-zinc-950">
      <Sidebar />
      <main
        className="flex-1 overflow-y-auto"
        style={{ marginLeft: "var(--sidebar-width)" }}
      >
        <div className="max-w-3xl mx-auto px-8 py-10">
          <SearchView />
        </div>
      </main>
    </div>
  );
}
