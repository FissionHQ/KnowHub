"use client";

import useSWR from "swr";
import { adminApi } from "@/lib/api";
import { Card, CardContent } from "@heroui/react";

export function AuditLogSection() {
  const { data: entries = [], isLoading } = useSWR("admin:audit-log", () =>
    adminApi.getAuditLog({ limit: 100 }),
  );

  return (
    <Card>
      <CardContent className="p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 dark:border-zinc-800 text-left text-zinc-500 dark:text-zinc-400">
              <th className="px-4 py-3 font-medium">Time</th>
              <th className="px-4 py-3 font-medium">Action</th>
              <th className="px-4 py-3 font-medium">Details</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-zinc-400">
                  Loading audit log…
                </td>
              </tr>
            )}
            {!isLoading && entries.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-zinc-400">
                  No audit events yet. Admin actions will appear here.
                </td>
              </tr>
            )}
            {entries.map((entry) => (
              <tr
                key={entry.id}
                className="border-b border-zinc-100 dark:border-zinc-800/80 last:border-0 align-top"
              >
                <td className="px-4 py-3 whitespace-nowrap text-zinc-500 dark:text-zinc-400">
                  {new Date(entry.timestamp).toLocaleString()}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-[#f25011]">
                  {entry.action}
                </td>
                <td className="px-4 py-3 text-zinc-600 dark:text-zinc-300">
                  <pre className="text-xs whitespace-pre-wrap font-sans">
                    {JSON.stringify(entry.target, null, 0)}
                  </pre>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
