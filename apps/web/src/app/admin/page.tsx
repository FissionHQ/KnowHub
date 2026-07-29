import { Suspense } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { AdminView } from "./AdminView";

export default function AdminPage() {
  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <main
        className="flex-1 overflow-y-auto"
        style={{ marginLeft: "var(--sidebar-width)" }}
      >
        <Suspense fallback={null}>
          <AdminView />
        </Suspense>
      </main>
    </div>
  );
}
