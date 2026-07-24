import { Sidebar } from "@/components/layout/Sidebar";
import { SearchView } from "./SearchView";

export default function SearchPage() {
  return (
    <div className="flex h-screen bg-zinc-50 dark:bg-zinc-950">
      <Sidebar />
      <main
        className="flex-1 overflow-y-auto flex flex-col"
        style={{ marginLeft: "var(--sidebar-width)" }}
      >
        <div className="flex-1 flex flex-col max-w-3xl mx-auto w-full px-8">
          <SearchView />
        </div>
      </main>
    </div>
  );
}
