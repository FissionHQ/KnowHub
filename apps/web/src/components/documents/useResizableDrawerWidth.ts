"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

export const DRAWER_WIDTH_STORAGE_KEY = "knowhub-doc-preview-drawer-width";
export const DRAWER_MIN_WIDTH = 350;
export const DRAWER_DEFAULT_WIDTH = 450;
export const DRAWER_MAX_VIEWPORT_RATIO = 0.8;

function getMaxWidth(viewportWidth = typeof window !== "undefined" ? window.innerWidth : 1200) {
  return Math.floor(viewportWidth * DRAWER_MAX_VIEWPORT_RATIO);
}

export function clampDrawerWidth(width: number, viewportWidth?: number) {
  const max = getMaxWidth(viewportWidth);
  return Math.min(max, Math.max(DRAWER_MIN_WIDTH, Math.round(width)));
}

function readStoredWidth(): number {
  if (typeof window === "undefined") return DRAWER_DEFAULT_WIDTH;
  try {
    const stored = localStorage.getItem(DRAWER_WIDTH_STORAGE_KEY);
    if (stored) {
      const parsed = Number(stored);
      if (!Number.isNaN(parsed) && parsed > 0) {
        return clampDrawerWidth(parsed);
      }
    }
  } catch {
    // ignore localStorage errors
  }
  return clampDrawerWidth(DRAWER_DEFAULT_WIDTH);
}

function persistWidth(width: number) {
  try {
    localStorage.setItem(DRAWER_WIDTH_STORAGE_KEY, String(width));
  } catch {
    // ignore localStorage errors
  }
}

const MOBILE_QUERY = "(max-width: 767px)";

export function useResizableDrawerWidth() {
  const [width, setWidthState] = useState(DRAWER_DEFAULT_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const widthRef = useRef(width);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  widthRef.current = width;

  useEffect(() => {
    setWidthState(readStoredWidth());

    const mq = window.matchMedia(MOBILE_QUERY);
    const updateMobile = () => setIsMobile(mq.matches);
    updateMobile();
    mq.addEventListener("change", updateMobile);
    return () => mq.removeEventListener("change", updateMobile);
  }, []);

  useEffect(() => {
    const onWindowResize = () => {
      setWidthState((current) => clampDrawerWidth(current));
    };
    window.addEventListener("resize", onWindowResize);
    return () => window.removeEventListener("resize", onWindowResize);
  }, []);

  const setWidth = useCallback((next: number) => {
    setWidthState(clampDrawerWidth(next));
  }, []);

  const endDrag = useCallback(() => {
    dragRef.current = null;
    setIsResizing(false);
    document.body.style.removeProperty("user-select");
    document.body.style.removeProperty("cursor");
    persistWidth(widthRef.current);
  }, []);

  const onResizePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (isMobile) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      dragRef.current = { startX: e.clientX, startWidth: widthRef.current };
      setIsResizing(true);
      document.body.style.userSelect = "none";
      document.body.style.cursor = "col-resize";
    },
    [isMobile],
  );

  const onResizePointerMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    const delta = dragRef.current.startX - e.clientX;
    setWidthState(clampDrawerWidth(dragRef.current.startWidth + delta));
  }, []);

  const onResizePointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!dragRef.current) return;
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      endDrag();
    },
    [endDrag],
  );

  const onResizePointerCancel = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!dragRef.current) return;
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      endDrag();
    },
    [endDrag],
  );

  const resizeHandleProps = useMemo(
    () => ({
      onPointerDown: onResizePointerDown,
      onPointerMove: onResizePointerMove,
      onPointerUp: onResizePointerUp,
      onPointerCancel: onResizePointerCancel,
    }),
    [
      onResizePointerDown,
      onResizePointerMove,
      onResizePointerUp,
      onResizePointerCancel,
    ],
  );

  return {
    drawerWidth: width,
    setDrawerWidth: setWidth,
    isResizing,
    isMobileDrawer: isMobile,
    resizeHandleProps,
  };
}
