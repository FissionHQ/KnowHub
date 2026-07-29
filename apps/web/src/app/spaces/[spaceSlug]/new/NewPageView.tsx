"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { documentsApi, spacesApi } from "@/lib/api";
import { spaceDocPath } from "@/lib/spacePath";
import type { Space } from "@wiki/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface Props {
  spaceSlug: string;
}

export function NewPageView({ spaceSlug }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const { data: space, isLoading } = useSWR<Space>(
    `space:${spaceSlug}`,
    () => spacesApi.get(spaceSlug),
  );

  useEffect(() => {
    if (isLoading || !space) return;
    if (space.accessLevel !== "edit") {
      setError("You need edit access to create pages in this space.");
      return;
    }

    let cancelled = false;

    async function createPage() {
      try {
        const doc = await documentsApi.create({
          spaceId: space!.id,
          type: "page",
          title: "Untitled",
          content: "",
        });

        if (!cancelled) {
          router.replace(spaceDocPath(space!, doc.slug));
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to create page");
        }
      }
    }

    createPage();

    return () => {
      cancelled = true;
    };
  }, [spaceSlug, router, space, isLoading]);

  if (error) {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <Card className="border-red-100 bg-red-50">
          <CardContent className="p-5 flex flex-col gap-3">
            <p className="text-red-600 text-sm">{error}</p>
            <Button variant="secondary" size="sm" onClick={() => router.back()}>
              Go back
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-4">
      <Skeleton className="w-1/3 h-4 rounded-md" />
      <Skeleton className="w-2/3 h-8 rounded-xl" />
      <Skeleton className="w-full h-96 rounded-xl" />
    </div>
  );
}
