import { redirect } from "next/navigation";

/** Legacy /admin/trash — trash lives under Settings. */
export default function AdminTrashRedirectPage() {
  redirect("/settings?tab=trash");
}
