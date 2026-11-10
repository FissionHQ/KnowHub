"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { fetchCollaborationToken } from "@/lib/collab";

const URL_BASE = process.env["NEXT_PUBLIC_A2UI_ENDPOINT"];
const PUBLIC_PREFIXES = ["/login", "/invite"]; // pre-sign-in pages: no chat
const APP = process.env["NEXT_PUBLIC_A2UI_APP"] ?? "know-hub";

/** A2UI middleware chat. Renders nothing unless NEXT_PUBLIC_A2UI_ENDPOINT is set, a user is signed in, and the page is not login/invite. */
export function A2uiChat() {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const show = !!URL_BASE && !loading && !!user && !PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
  const ref = useRef<HTMLElement & { getToken?: () => Promise<string | undefined> }>(null);

//   <script type="module" src="http://localhost:4902/chat.js"></script>
// <a2ui-chat app="know-hub" endpoint="http://localhost:4902"></a2ui-chat>
// <script>
//   // However your app keeps the signed-in user's token:
//   document.querySelector('a2ui-chat').getToken = () => yourApp.currentUserToken();
// </script>
  useEffect(() => {
    if (!URL_BASE || document.querySelector("script[data-a2ui]")) return;
    const s = document.createElement("script");
    s.type = "module";
    s.src = `${URL_BASE}/chat.js`;
    s.dataset["a2ui"] = "1";
    document.head.appendChild(s);
  }, []);

  useEffect(() => {
    // wiki_token is httpOnly; this route hands it to the signed-in user (same one the editor uses).
    if (ref.current) ref.current.getToken = fetchCollaborationToken;
  }, [show]);

  if (!show) return null;
  // @ts-expect-error custom element
  return <a2ui-chat ref={ref} app={APP} endpoint={URL_BASE} />;
}
