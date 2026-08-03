"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Mount children inside a Shadow Root with only pptx-react-viewer CSS.
 *
 * KnowHub also ships Tailwind: the same utility class names collide and the
 * app's rules win, which breaks slide text metrics (overlap / oversized type).
 * The upstream demo is a dedicated app, so it never hits that clash.
 */
export function PptxIsolatedShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [mountNode, setMountNode] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const shadow = host.shadowRoot ?? host.attachShadow({ mode: "open" });

    let reset = shadow.querySelector("style[data-pptx-reset]");
    if (!reset) {
      reset = document.createElement("style");
      reset.setAttribute("data-pptx-reset", "");
      reset.textContent = `
        :host {
          display: block;
          width: 100%;
          height: 100%;
          font-family: Calibri, "Segoe UI", Arial, Helvetica, sans-serif;
          font-size: 16px;
          line-height: normal;
          letter-spacing: normal;
          color: #111;
        }
        .pptx-shadow-mount {
          box-sizing: border-box;
          width: 100%;
          height: 100%;
          overflow: hidden;
          font-family: inherit;
          font-size: inherit;
          line-height: inherit;
        }
        .pptx-shadow-mount *,
        .pptx-shadow-mount *::before,
        .pptx-shadow-mount *::after {
          box-sizing: border-box;
        }
      `;
      shadow.appendChild(reset);
    }

    let link = shadow.querySelector(
      "link[data-pptx-viewer-css]",
    ) as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "/vendor/pptx-viewer.css";
      link.setAttribute("data-pptx-viewer-css", "");
      shadow.appendChild(link);
    }

    let mount = shadow.querySelector(".pptx-shadow-mount") as HTMLDivElement | null;
    if (!mount) {
      mount = document.createElement("div");
      mount.className = "pptx-shadow-mount";
      shadow.appendChild(mount);
    }

    let cancelled = false;
    const ready = () => {
      if (!cancelled) setMountNode(mount);
    };

    if (link.sheet) {
      ready();
    } else {
      link.addEventListener("load", ready);
      link.addEventListener("error", ready);
      // Cached CSS may not fire load in some browsers.
      const t = window.setTimeout(ready, 50);
      return () => {
        cancelled = true;
        window.clearTimeout(t);
        link?.removeEventListener("load", ready);
        link?.removeEventListener("error", ready);
      };
    }

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div ref={hostRef} className={className}>
      {mountNode ? createPortal(children, mountNode) : null}
    </div>
  );
}
