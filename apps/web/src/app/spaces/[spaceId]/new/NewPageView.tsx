"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { documentsApi } from "@/lib/api";
import { Button, Card, CardContent, Skeleton } from "@heroui/react";

interface Props {
  spaceId: string;
}

export function NewPageView({ spaceId }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function createPage() {
      try {
        const doc = await documentsApi.create({
          spaceId,
          type: "page",
          title: "Untitled",
          content: "",
        });

        if (!cancelled) {
          router.replace(`/spaces/${spaceId}/docs/${doc.id}`);
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
  }, [spaceId, router]);

  if (error) {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <Card className="border-red-100 bg-red-50">
          <CardContent className="p-5 flex flex-col gap-3">
            <p className="text-red-600 text-sm">{error}</p>
            <Button variant="secondary" size="sm" onPress={() => router.back()}>
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
