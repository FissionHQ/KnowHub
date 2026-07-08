import { Sidebar } from "@/components/layout/Sidebar";
import { AdminView } from "./AdminView";

export default function AdminPage() {
  return (
    <div className="flex h-screen bg-zinc-50 dark:bg-zinc-950">
      <Sidebar />
      <main
        className="flex-1 overflow-y-auto"
        style={{ marginLeft: "var(--sidebar-width)" }}
      >
        <AdminView />
      </main>
    </div>
  );
}
