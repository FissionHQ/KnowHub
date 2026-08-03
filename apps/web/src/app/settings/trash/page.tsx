import { redirect } from "next/navigation";

export default function SettingsTrashRedirectPage() {
  redirect("/settings?tab=trash");
}
