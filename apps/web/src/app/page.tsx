import { redirect } from "next/navigation";

// Root → redirect to spaces
export default function Home() {
  redirect("/spaces");
}
