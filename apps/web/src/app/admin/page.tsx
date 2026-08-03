import { redirect } from "next/navigation";

/** Legacy /admin URL — Settings lives at /settings. */
export default function AdminRedirectPage() {
  redirect("/settings");
}
