"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as Y from "yjs";
import { HocuspocusProvider } from "@hocuspocus/provider";
import { getCollabWsUrl, getCollaborationToken, colorForUser } from "@/lib/collab";

export type CollabStatus = "connecting" | "connected" | "disconnected";
export type SaveStatus = "saved" | "saving";

interface Options {
  orgId: string;
  documentId: string;
  userId: string;
  userName: string;
  enabled?: boolean;
}

export function useCollaboration({
  orgId,
  documentId,
  userId,
  userName,
  enabled = true,
}: Options) {
  const [status, setStatus] = useState<CollabStatus>("connecting");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [editorCount, setEditorCount] = useState(1);
  const [provider, setProvider] = useState<HocuspocusProvider | null>(null);
  const ydoc = useMemo(() => new Y.Doc(), [documentId]);
  const userColor = useMemo(() => colorForUser(userId), [userId]);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!provider) return;
    provider.setAwarenessField("user", {
      id: userId,
      name: userName,
      color: userColor,
    });
  }, [provider, userId, userName, userColor]);

  useEffect(() => {
    if (!enabled || !orgId || !documentId || !userId) {
      setStatus("disconnected");
      setEditorCount(1);
      return;
    }

    const token = getCollaborationToken();
    if (!token) {
      setStatus("disconnected");
      setEditorCount(1);
      return;
    }

    let cancelled = false;

    const collabProvider = new HocuspocusProvider({
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
      onSynced: () => {
        if (!cancelled) setSaveStatus("saved");
      },
    });

    const markSynced = () => {
      if (!cancelled) setSaveStatus("saved");
    };

    collabProvider.on("synced", markSynced);
    if (collabProvider.isSynced) markSynced();

    const refreshEditorCount = () => {
      const states = collabProvider.awareness?.getStates() ?? new Map();
      const userIds = new Set<string>();

      states.forEach((state) => {
        const id = (state.user as { id?: string } | undefined)?.id;
        if (id) userIds.add(id);
      });

      if (userIds.size === 0 && collabProvider.isConnected) {
        userIds.add(userId);
      }

      setEditorCount(Math.max(userIds.size, 1));
    };

    collabProvider.awareness?.on("change", refreshEditorCount);
    refreshEditorCount();

    const onDocUpdate = (_update: Uint8Array, origin: unknown) => {
      if (origin === collabProvider) return;
      setSaveStatus("saving");
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => setSaveStatus("saved"), 2000);
    };

    ydoc.on("update", onDocUpdate);
    setProvider(collabProvider);

    return () => {
      cancelled = true;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      ydoc.off("update", onDocUpdate);
      collabProvider.off("synced", markSynced);
      collabProvider.awareness?.off("change", refreshEditorCount);
      collabProvider.destroy();
      setProvider(null);
      setEditorCount(1);
    };
  }, [enabled, orgId, documentId, userId, ydoc]);

  return {
    ydoc,
    provider,
    status,
    saveStatus,
    editorCount,
  };
}
