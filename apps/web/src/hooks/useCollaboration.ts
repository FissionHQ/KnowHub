"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Y from "yjs";
import { HocuspocusProvider } from "@hocuspocus/provider";
import {
  getCollabWsUrl,
  getCollabConnectionErrorMessage,
  fetchCollaborationToken,
  colorForUser,
  type CollabAwarenessUser,
  type PresenceCounts,
} from "@/lib/collab";

const CONNECT_TIMEOUT_MS = 15_000;

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

interface StablePair {
  ydoc: Y.Doc;
  provider: HocuspocusProvider;
  documentId: string;
}

function countPresence(
  states: Map<number, Record<string, unknown>>,
  self: { userId: string; canEdit: boolean },
  isConnected: boolean,
): PresenceCounts {
  const editors = new Set<string>();
  const viewers = new Set<string>();

  for (const state of states.values()) {
    const user = state.user as CollabAwarenessUser | undefined;
    if (!user?.id) continue;
    if (user.mode === "edit") editors.add(user.id);
    else viewers.add(user.id);
  }

  // Count self while awareness is still propagating (unique per user, not per tab).
  if (isConnected && self.canEdit && !editors.has(self.userId)) {
    editors.add(self.userId);
  } else if (isConnected && !self.canEdit && !viewers.has(self.userId)) {
    viewers.add(self.userId);
  }

  return { editors: editors.size, viewers: viewers.size };
}

function clearLocalAwareness(provider: HocuspocusProvider | null): void {
  if (!provider?.awareness) return;
  try {
    provider.awareness.setLocalState(null);
  } catch {
    // Provider may already be torn down.
  }
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
  const [presence, setPresence] = useState<PresenceCounts>({ editors: 0, viewers: 0 });
  const [stable, setStable] = useState<StablePair | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);

  const pendingYdoc = useMemo(() => new Y.Doc(), [documentId]);
  const userColor = useMemo(() => colorForUser(userId), [userId]);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const canEditRef = useRef(canEdit);
  const documentIdRef = useRef(documentId);

  useEffect(() => {
    canEditRef.current = canEdit;
  }, [canEdit]);

  useEffect(() => {
    documentIdRef.current = documentId;
  }, [documentId]);

  // Publish local awareness only for the active document's provider.
  useEffect(() => {
    if (!stable?.provider || stable.documentId !== documentId) return;

    stable.provider.setAwarenessField("user", {
      id: userId,
      name: userName,
      color: userColor,
      mode: canEdit ? "edit" : "view",
    } satisfies CollabAwarenessUser);

    const states = stable.provider.awareness?.getStates() ?? new Map();
    setPresence(
      countPresence(states, { userId, canEdit }, stable.provider.isConnected),
    );
  }, [stable, documentId, userId, userName, userColor, canEdit]);

  const retry = useCallback(() => {
    setConnectionError(null);
    setRetryNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!enabled || !orgId || !documentId || !userId) {
      setStatus("disconnected");
      setStable(null);
      setPresence({ editors: 0, viewers: 0 });
      setConnectionError(null);
      return;
    }

    let cancelled = false;
    let collabProvider: HocuspocusProvider | null = null;
    let onDocUpdate: ((_update: Uint8Array, origin: unknown) => void) | null = null;
    let markSynced: (() => void) | null = null;
    let refreshPresence: (() => void) | null = null;
    let connectTimer: ReturnType<typeof setTimeout> | null = null;
    let synced = false;

    const failConnection = (message: string) => {
      if (cancelled || synced) return;
      if (connectTimer) clearTimeout(connectTimer);
      setConnectionError(message);
      setStatus("disconnected");
      if (collabProvider) {
        clearLocalAwareness(collabProvider);
        collabProvider.destroy();
        collabProvider = null;
      }
    };

    const promoteStable = (provider: HocuspocusProvider) => {
      if (cancelled || synced) return;
      if (documentIdRef.current !== documentId) return;
      synced = true;
      if (connectTimer) clearTimeout(connectTimer);
      setConnectionError(null);
      setStable({ ydoc: pendingYdoc, provider, documentId });
      setSaveStatus("saved");
    };

    setStatus("connecting");
    setStable(null);
    setSaveStatus("saved");
    setPresence({ editors: 0, viewers: 0 });
    setConnectionError(null);

    connectTimer = setTimeout(() => {
      failConnection(getCollabConnectionErrorMessage());
    }, CONNECT_TIMEOUT_MS);

    void (async () => {
      const token = await fetchCollaborationToken();
      if (cancelled) return;

      if (!token) {
        failConnection("Could not start a collaboration session. Try signing in again.");
        setPresence(canEditRef.current ? { editors: 1, viewers: 0 } : { editors: 0, viewers: 1 });
        return;
      }

      collabProvider = new HocuspocusProvider({
        url: getCollabWsUrl(),
        name: `${orgId}:${documentId}`,
        document: pendingYdoc,
        token,
        onConnect: () => {
          if (!cancelled) setStatus("connected");
        },
        onDisconnect: () => {
          if (!cancelled) setStatus("disconnected");
        },
        onStatus: ({ status: next }) => {
          if (cancelled) return;
          setStatus(next === "connected" ? "connected" : "connecting");
        },
        onAuthenticationFailed: () => {
          if (cancelled) return;
          failConnection("Collaboration authentication failed. Try signing in again.");
        },
        onSynced: () => {
          if (cancelled || !collabProvider) return;
          promoteStable(collabProvider);
        },
      });

      markSynced = () => {
        if (cancelled || !collabProvider) return;
        promoteStable(collabProvider);
      };

      collabProvider.on("synced", markSynced);
      if (collabProvider.isSynced) markSynced();

      refreshPresence = () => {
        if (!collabProvider || cancelled) return;
        const states = collabProvider.awareness?.getStates() ?? new Map();
        setPresence(
          countPresence(
            states,
            { userId, canEdit: canEditRef.current },
            collabProvider.isConnected,
          ),
        );
      };

      collabProvider.awareness?.on("change", refreshPresence);
      refreshPresence();

      onDocUpdate = (_update: Uint8Array, origin: unknown) => {
        if (origin === collabProvider) return;
        setSaveStatus("saving");
        if (saveTimer.current) clearTimeout(saveTimer.current);
        // Match collab persist debounce so "saved" lines up with draft_* write.
        saveTimer.current = setTimeout(() => setSaveStatus("saved"), 3000);
      };

      pendingYdoc.on("update", onDocUpdate);
    })();

    return () => {
      cancelled = true;
      if (connectTimer) clearTimeout(connectTimer);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (onDocUpdate) pendingYdoc.off("update", onDocUpdate);
      if (collabProvider) {
        if (markSynced) collabProvider.off("synced", markSynced);
        if (refreshPresence) collabProvider.awareness?.off("change", refreshPresence);
        clearLocalAwareness(collabProvider);
        collabProvider.destroy();
      }
      setStable(null);
    };
  }, [enabled, orgId, documentId, userId, pendingYdoc, retryNonce]);

  const currentStable = stable?.documentId === documentId ? stable : null;

  return {
    ydoc: currentStable?.ydoc ?? null,
    provider: currentStable?.provider ?? null,
    status,
    saveStatus,
    presence,
    connectionError,
    retry,
  };
}
