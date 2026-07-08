"use client";

import useSWR from "swr";
import Link from "next/link";
import { spacesApi } from "@/lib/api";
import type { Space } from "@wiki/types";
import { Card, CardContent, Skeleton } from "@heroui/react";
import { ArrowRight } from "lucide-react";

export function SpacesList() {
  const { data: spaces, isLoading, error } = useSWR<Space[]>("spaces", spacesApi.list);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i} className="h-28">
            <CardContent className="flex flex-col gap-3 p-5">
              <Skeleton className="w-10 h-10 rounded-xl" />
              <Skeleton className="w-3/4 h-4 rounded-md" />
              <Skeleton className="w-1/2 h-3 rounded-md" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-red-100 bg-red-50">
        <CardContent className="p-4 text-red-600 text-sm">Failed to load spaces.</CardContent>
      </Card>
    );
  }

  if (!spaces?.length) {
    return (
      <Card>
        <CardContent className="py-16 flex flex-col items-center gap-3 text-zinc-400 p-5">
          <span className="text-4xl">🌌</span>
          <p className="text-sm">No spaces yet. Ask an admin to create one.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {spaces.map((space) => (
        <Link key={space.id} href={`/spaces/${space.id}`} className="group block">
          <Card className="h-full transition-all duration-200 hover:shadow-md hover:border-violet-200 dark:hover:border-violet-800 cursor-pointer">
            <CardContent className="p-5 flex flex-col gap-3 h-full">
              <div className="flex items-start justify-between">
                <span className="text-3xl">{space.iconEmoji ?? "📄"}</span>
                <ArrowRight
                  size={16}
                  className="text-zinc-300 group-hover:text-violet-500 group-hover:translate-x-0.5 transition-all mt-1"
                />
              </div>
              <div>
                <h2 className="font-semibold text-zinc-900 dark:text-zinc-100 text-sm leading-snug truncate">
                  {space.name}
                </h2>
                {space.description && (
                  <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2">{space.description}</p>
                )}
              </div>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
