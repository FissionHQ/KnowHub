import { Suspense } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { SettingsView } from "./SettingsView";

export default function SettingsPage() {
  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <main
        className="flex-1 overflow-y-auto"
        style={{ marginLeft: "var(--sidebar-width)" }}
      >
        <Suspense fallback={null}>
          <SettingsView />
        </Suspense>
      </main>
    </div>
  );
}
