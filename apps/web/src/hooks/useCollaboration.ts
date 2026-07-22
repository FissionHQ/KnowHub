"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as Y from "yjs";
import { HocuspocusProvider } from "@hocuspocus/provider";
import {
  getCollabWsUrl,
  fetchCollaborationToken,
  colorForUser,
  type CollabAwarenessUser,
  type PresenceCounts,
} from "@/lib/collab";

export type CollabStatus = "connecting" | "connected" | "disconnected";
export type SaveStatus = "saved" | "saving";

interface Options {
  orgId: string;
  documentId: string;
  userId: string;
  userName: string;
  canEdit: boolean;
  enabled?: boolean;
}

function countPresence(
  states: Map<number, Record<string, unknown>>,
  self: { userId: string; canEdit: boolean },
  isConnected: boolean,
): PresenceCounts {
  const editors = new Set<string>();
  const viewers = new Set<string>();

  states.forEach((state) => {
    const user = state.user as CollabAwarenessUser | undefined;
    if (!user?.id) return;
    if (user.mode === "edit") editors.add(user.id);
    else viewers.add(user.id);
  });

  if (editors.size === 0 && viewers.size === 0 && isConnected) {
    if (self.canEdit) editors.add(self.userId);
    else viewers.add(self.userId);
  }

  return {
    editors: editors.size,
    viewers: viewers.size,
  };
}

export function useCollaboration({
  orgId,
  documentId,
  userId,
  userName,
  canEdit,
  enabled = true,
}: Options) {
  const [status, setStatus] = useState<CollabStatus>("connecting");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [presence, setPresence] = useState<PresenceCounts>({ editors: 0, viewers: 1 });
  const [provider, setProvider] = useState<HocuspocusProvider | null>(null);
  const ydoc = useMemo(() => new Y.Doc(), [documentId]);
  const userColor = useMemo(() => colorForUser(userId), [userId]);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const canEditRef = useRef(canEdit);

  useEffect(() => {
    canEditRef.current = canEdit;
  }, [canEdit]);

  useEffect(() => {
    if (!provider) return;
    provider.setAwarenessField("user", {
      id: userId,
      name: userName,
      color: userColor,
      mode: canEdit ? "edit" : "view",
    } satisfies CollabAwarenessUser);

    const states = provider.awareness?.getStates() ?? new Map();
    setPresence(countPresence(states, { userId, canEdit }, provider.isConnected));
  }, [provider, userId, userName, userColor, canEdit]);

  useEffect(() => {
    if (!enabled || !orgId || !documentId || !userId) {
      setStatus("disconnected");
      setPresence(canEdit ? { editors: 1, viewers: 0 } : { editors: 0, viewers: 1 });
      return;
    }

    let cancelled = false;
    let collabProvider: HocuspocusProvider | null = null;
    let onDocUpdate: ((_update: Uint8Array, origin: unknown) => void) | null = null;
    let markSynced: (() => void) | null = null;
    let refreshPresence: (() => void) | null = null;

    void (async () => {
      const token = await fetchCollaborationToken();
      if (cancelled) return;

      if (!token) {
        setStatus("disconnected");
        setPresence(canEditRef.current ? { editors: 1, viewers: 0 } : { editors: 0, viewers: 1 });
        return;
      }

      collabProvider = new HocuspocusProvider({
        url: getCollabWsUrl(),
        name: `${orgId}:${documentId}`,
        document: ydoc,
        token,
        onConnect: () => {
          if (!cancelled) setStatus("connected");
        },
        onDisconnect: () => {
          if (!cancelled) setStatus("disconnected");
        },
        onStatus: ({ status: next }) => {
          if (!cancelled) {
            setStatus(next === "connected" ? "connected" : "connecting");
          }
        },
        onAuthenticationFailed: () => {
          if (cancelled) return;
          setStatus("disconnected");
          // Stop retrying against a permanently rejected auth — fallback editor will take over.
          collabProvider?.disconnect();
        },
        onSynced: () => {
          if (!cancelled) setSaveStatus("saved");
        },
      });

      markSynced = () => {
        if (!cancelled) setSaveStatus("saved");
      };

      collabProvider.on("synced", markSynced);
      if (collabProvider.isSynced) markSynced();

      refreshPresence = () => {
        if (!collabProvider) return;
        const states = collabProvider.awareness?.getStates() ?? new Map();
        setPresence(
          countPresence(states, { userId, canEdit: canEditRef.current }, collabProvider.isConnected),
        );
      };

      collabProvider.awareness?.on("change", refreshPresence);
      refreshPresence();

      onDocUpdate = (_update: Uint8Array, origin: unknown) => {
        if (origin === collabProvider) return;
        setSaveStatus("saving");
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => setSaveStatus("saved"), 4000);
      };

      ydoc.on("update", onDocUpdate);
      if (!cancelled) setProvider(collabProvider);
    })();

    return () => {
      cancelled = true;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (onDocUpdate) ydoc.off("update", onDocUpdate);
      if (collabProvider) {
        if (markSynced) collabProvider.off("synced", markSynced);
        if (refreshPresence) collabProvider.awareness?.off("change", refreshPresence);
        collabProvider.destroy();
      }
      setProvider(null);
      setPresence(canEditRef.current ? { editors: 1, viewers: 0 } : { editors: 0, viewers: 1 });
    };
  }, [enabled, orgId, documentId, userId, ydoc]);

  return {
    ydoc,
    provider,
    status,
    saveStatus,
    presence,
  };
}
