"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import useSWR from "swr";
import { createPortal } from "react-dom";
import { spacesApi, activityApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Space, Document } from "@wiki/types";
import { Separator } from "@/components/ui/separator";
import {
  LogOut,
  Search,
  Settings,
  User,
  Zap,
  ChevronRight,
  ChevronDown,
  Clock,
  Star,
  RefreshCw,
  MoreHorizontal,
  Upload,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { importDocumentFile, importPdfAsViewer } from "@/lib/importDocument";
import { PdfImportModal } from "@/components/PdfImportModal";
import { spaceDocPath, spacePath } from "@/lib/spacePath";
import { SpaceDocTree } from "./SpaceDocTree";

/** Fission sidebar nav item styles — match ui-design-system AppSidebar */
const navItemBase =
  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors";
const navItemIdle = "text-sidebar-muted hover:bg-white/5 hover:text-sidebar-foreground";
const navItemActive = "bg-sidebar-accent text-primary";

/** Survives Sidebar remounts when navigating between pages. */
const expandedSpaceIds = new Set<string>();

function SpaceRow({
  space,
  isActive,
  onMenuOpen,
}: {
  space: Space;
  isActive: boolean;
  onMenuOpen: (e: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  const [open, setOpen] = useState(
    () => expandedSpaceIds.has(space.id) || isActive,
  );

  // Keep the active space expanded when landing via a deep link / doc URL.
  useEffect(() => {
    if (!isActive) return;
    if (expandedSpaceIds.has(space.id)) return;
    expandedSpaceIds.add(space.id);
    setOpen(true);
  }, [isActive, space.id]);

  function setExpanded(next: boolean) {
    if (next) expandedSpaceIds.add(space.id);
    else expandedSpaceIds.delete(space.id);
    setOpen(next);
  }

  function toggleExpanded() {
    setExpanded(!open);
  }

  return (
    <div>
      <div className="group/space flex items-center gap-0.5 rounded-md pr-1">
        <button
          type="button"
          onClick={toggleExpanded}
          className="shrink-0 w-5 h-5 flex items-center justify-center text-sidebar-muted hover:text-sidebar-foreground ml-1 transition-colors"
          aria-label={open ? "Collapse space" : "Expand space"}
        >
          <ChevronRight size={12} className={cn("transition-transform", open && "rotate-90")} />
        </button>
        <Link
          href={spacePath(space)}
          onClick={(e) => {
            if (open) {
              // Collapse without navigating away from the current doc/page.
              e.preventDefault();
              setExpanded(false);
            } else {
              setExpanded(true);
            }
          }}
          className={cn(
            "flex-1 min-w-0",
            navItemBase,
            "gap-2.5 px-2",
            isActive ? navItemActive : navItemIdle,
          )}
        >
          <span className="truncate">{space.name}</span>
        </Link>
        <button
          type="button"
          onClick={onMenuOpen}
          className={cn(
            "shrink-0 transition-opacity text-sidebar-muted hover:text-sidebar-foreground w-5 h-5 flex items-center justify-center rounded-md",
            space.accessLevel === "edit" ? "opacity-0 group-hover/space:opacity-100" : "hidden",
          )}
          title="More options"
        >
          <MoreHorizontal size={12} />
        </button>
      </div>
      {open && (
        <SpaceDocTree
          spaceId={space.id}
          spaceSlug={space.slug}
          canEdit={space.accessLevel === "edit"}
        />
      )}
    </div>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const { data: spaces = [] } = useSWR<Space[]>(user ? "spaces" : null, spacesApi.list);
  const { data: recentDocs = [] } = useSWR<Document[]>(user ? "recent" : null, activityApi.getRecent);
  const { data: recentlyUpdated = [] } = useSWR<Document[]>(
    user ? "recently-updated" : null,
    activityApi.getRecentlyUpdated,
  );
  const { data: favDocs = [] } = useSWR<Document[]>(user ? "favorites" : null, activityApi.getFavorites);

  const [showBookmarks, setShowBookmarks] = useState(false);
  const [showRecentlyViewed, setShowRecentlyViewed] = useState(false);
  const [showRecentlyUpdated, setShowRecentlyUpdated] = useState(false);
  const [spaceMenu, setSpaceMenu] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadSpaceRef = useRef<string>("");
  const [pdfModalFile, setPdfModalFile] = useState<File | null>(null);
  const [pdfModalSpaceId, setPdfModalSpaceId] = useState<string>("");

  async function handleFileImport(space: Space, file: File) {
    setSpaceMenu(null);
    if (file.name.toLowerCase().endsWith(".pdf")) {
      setPdfModalSpaceId(space.id);
      setPdfModalFile(file);
      return;
    }
    try {
      const doc = await importDocumentFile(space.id, file);
      router.push(spaceDocPath(space, doc.slug));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to import file");
    }
  }

  async function handlePdfConvert() {
    if (!pdfModalFile) return;
    const spaceId = pdfModalSpaceId;
    const file = pdfModalFile;
    setPdfModalFile(null);
    try {
      const doc = await importDocumentFile(spaceId, file);
      router.push(`/spaces/${spaceId}/docs/${doc.id}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to import file");
    }
  }

  async function handlePdfAttach() {
    if (!pdfModalFile) return;
    const spaceId = pdfModalSpaceId;
    const file = pdfModalFile;
    setPdfModalFile(null);
    try {
      const doc = await importPdfAsViewer(spaceId, file);
      router.push(`/spaces/${spaceId}/docs/${doc.id}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to import file");
    }
  }

  const spaceMatch = pathname.match(/^\/spaces\/([^/]+)/);
  const activeSpaceRef = spaceMatch?.[1] ?? null;
  const slugById = Object.fromEntries(spaces.map((s) => [s.id, s.slug]));

  return (
    <aside
      className="fixed left-0 top-0 h-full flex flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground z-20"
      style={{ width: "var(--sidebar-width)" }}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.doc,.docx,.txt,.md"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          const space = spaces.find((s) => s.id === uploadSpaceRef.current);
          if (file && space) {
            void handleFileImport(space, file);
          }
          e.target.value = "";
        }}
      />

      <div className="px-4 py-4 flex items-center gap-2.5">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary shadow-sm">
          <Zap size={15} className="text-primary-foreground" strokeWidth={2.5} />
        </div>
        <Link
          href="/spaces"
          className="min-w-0 flex-1 truncate text-sm font-semibold leading-tight text-sidebar-foreground hover:text-sidebar-foreground"
        >
          KnowHub
        </Link>
      </div>

      <Separator className="bg-sidebar-border" />

      <div className="px-3 pt-2 pb-1">
        <Link
          href="/search"
          className={cn(navItemBase, pathname === "/search" ? navItemActive : navItemIdle)}
        >
          <Search size={14} className="shrink-0" />
          <span className="flex-1">Search</span>
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-1">
        <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-sidebar-muted">
          Spaces
        </p>
        <div className="flex flex-col gap-0.5">
          {spaces.map((space) => (
            <SpaceRow
              key={space.id}
              space={space}
              isActive={activeSpaceRef === space.slug || activeSpaceRef === space.id}
              onMenuOpen={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (space.accessLevel !== "edit") return;
                const rect = e.currentTarget.getBoundingClientRect();
                setMenuPos({ top: rect.bottom + 4, left: rect.left });
                setSpaceMenu(spaceMenu === space.id ? null : space.id);
              }}
            />
          ))}
          {spaces.length === 0 && (
            <p className="px-3 py-2 text-xs text-sidebar-muted">No spaces yet</p>
          )}
        </div>

        <button
          type="button"
          onClick={() => setShowBookmarks((v) => !v)}
          className="flex w-full items-center gap-1 px-3 pt-4 pb-1 text-left text-[10px] font-semibold uppercase tracking-wider text-sidebar-muted transition-colors hover:text-sidebar-foreground"
        >
          {showBookmarks ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
          Bookmarks
          {favDocs.length > 0 && (
            <span className="ml-auto rounded-full bg-white/10 px-1.5 py-0.5 text-[9px] text-sidebar-muted">
              {favDocs.length}
            </span>
          )}
        </button>
        {showBookmarks &&
          (favDocs.length > 0 ? (
            <div className="mb-1 flex flex-col gap-0.5">
              {favDocs.slice(0, 5).map((doc) => (
                <Link
                  key={doc.id}
                  href={`/spaces/${slugById[doc.spaceId] ?? doc.spaceId}/docs/${doc.slug}`}
                  className={cn(navItemBase, "gap-2 pl-6 pr-3 py-1.5", navItemIdle)}
                >
                  <Star size={11} className="shrink-0 fill-amber-400 text-amber-400" />
                  <span className="truncate">{doc.title}</span>
                </Link>
              ))}
            </div>
          ) : (
            <p className="mb-1 px-3 py-1 text-[11px] text-sidebar-muted">
              Click &quot;Bookmark&quot; on any page
            </p>
          ))}

        <button
          type="button"
          onClick={() => setShowRecentlyViewed((v) => !v)}
          className="flex w-full items-center gap-1 px-3 pt-3 pb-1 text-left text-[10px] font-semibold uppercase tracking-wider text-sidebar-muted transition-colors hover:text-sidebar-foreground"
        >
          {showRecentlyViewed ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
          Recently viewed
          {recentDocs.length > 0 && (
            <span className="ml-auto rounded-full bg-white/10 px-1.5 py-0.5 text-[9px] text-sidebar-muted">
              {recentDocs.length}
            </span>
          )}
        </button>
        {showRecentlyViewed &&
          (recentDocs.length > 0 ? (
            <div className="mb-1 flex flex-col gap-0.5">
              {recentDocs.slice(0, 5).map((doc) => (
                <Link
                  key={doc.id}
                  href={`/spaces/${slugById[doc.spaceId] ?? doc.spaceId}/docs/${doc.slug}`}
                  className={cn(navItemBase, "gap-2 pl-6 pr-3 py-1.5", navItemIdle)}
                >
                  <Clock size={11} className="shrink-0 text-sidebar-muted" />
                  <span className="truncate">{doc.title}</span>
                </Link>
              ))}
            </div>
          ) : (
            <p className="mb-1 px-3 py-1 text-[11px] text-sidebar-muted">Pages you open appear here</p>
          ))}

        <button
          type="button"
          onClick={() => setShowRecentlyUpdated((v) => !v)}
          className="flex w-full items-center gap-1 px-3 pt-3 pb-1 text-left text-[10px] font-semibold uppercase tracking-wider text-sidebar-muted transition-colors hover:text-sidebar-foreground"
        >
          {showRecentlyUpdated ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
          Recently updated
          {recentlyUpdated.length > 0 && (
            <span className="ml-auto rounded-full bg-white/10 px-1.5 py-0.5 text-[9px] text-sidebar-muted">
              {recentlyUpdated.length}
            </span>
          )}
        </button>
        {showRecentlyUpdated &&
          (recentlyUpdated.length > 0 ? (
            <div className="mb-1 flex flex-col gap-0.5">
              {recentlyUpdated.slice(0, 5).map((doc) => (
                <Link
                  key={doc.id}
                  href={`/spaces/${slugById[doc.spaceId] ?? doc.spaceId}/docs/${doc.slug}`}
                  className={cn(navItemBase, "gap-2 pl-6 pr-3 py-1.5", navItemIdle)}
                >
                  <RefreshCw size={11} className="shrink-0 text-sidebar-muted" />
                  <span className="truncate">{doc.title}</span>
                </Link>
              ))}
            </div>
          ) : (
            <p className="mb-1 px-3 py-1 text-[11px] text-sidebar-muted">Pages you edit appear here</p>
          ))}
      </nav>

      <Separator className="bg-sidebar-border" />

      <div className="flex flex-col gap-1 px-3 py-3">
        {user && (
          <div className="mb-1 px-3 py-2">
            <div className="flex items-center gap-2 text-sm text-sidebar-muted">
              <User size={14} className="shrink-0 text-sidebar-muted" />
              <div className="min-w-0">
                <p className="truncate font-medium text-sidebar-foreground">{user.name}</p>
                <p className="truncate text-xs capitalize text-sidebar-muted">{user.role}</p>
              </div>
            </div>
          </div>
        )}
        {user?.role === "admin" && (
          <Link
            href="/admin"
            className={cn(navItemBase, pathname.startsWith("/admin") ? navItemActive : navItemIdle)}
          >
            <Settings size={14} className="shrink-0" />
            <span>Admin</span>
          </Link>
        )}
        <button type="button" onClick={() => logout()} className={cn(navItemBase, "w-full text-left", navItemIdle)}>
          <LogOut size={14} className="shrink-0" />
          <span>Sign out</span>
        </button>
      </div>

      {pdfModalFile && typeof window !== "undefined" && (
        <PdfImportModal
          fileName={pdfModalFile.name}
          onConvert={() => { void handlePdfConvert(); }}
          onAttach={() => { void handlePdfAttach(); }}
          onCancel={() => setPdfModalFile(null)}
        />
      )}

      {spaceMenu &&
        typeof window !== "undefined" &&
        createPortal(
          <>
            <div className="fixed inset-0 z-[9999]" onClick={() => setSpaceMenu(null)} />
            <div
              style={{ top: menuPos.top, left: menuPos.left }}
              className="fixed z-[9999] w-44 rounded-md border border-sidebar-border bg-sidebar py-1 text-sm shadow-xl"
            >
              <button
                type="button"
                onClick={() => {
                  uploadSpaceRef.current = spaceMenu;
                  setSpaceMenu(null);
                  fileInputRef.current?.click();
                }}
                className={cn(navItemBase, "w-full text-left", navItemIdle)}
              >
                <Upload size={14} />
                Import document
              </button>
            </div>
          </>,
          document.body,
        )}
    </aside>
  );
}
