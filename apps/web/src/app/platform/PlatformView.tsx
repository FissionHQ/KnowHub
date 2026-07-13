"use client";

import { useState } from "react";
import useSWR from "swr";
import { platformApi } from "@/lib/api";
import type { PlatformOrgSummary, ProvisionOrgBody } from "@wiki/types";
import { Button, Card, CardContent, Chip } from "@heroui/react";
import { Building2, Globe, Plus, Shield } from "lucide-react";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-zinc-600 mb-1">{label}</label>
      {children}
    </div>
  );
}

const inputClass =
  "w-full h-9 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm";

export function PlatformView() {
  const [apiKey, setApiKey] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<ProvisionOrgBody>({
    subdomain: "",
    name: "",
    adminEmail: "",
    adminName: "",
    adminPassword: "",
  });

  const { data: orgs = [], mutate, isLoading } = useSWR<PlatformOrgSummary[]>(
    authenticated ? "platform-orgs" : null,
    () => platformApi.listOrgs(),
  );

  function handleAuth(e: React.FormEvent) {
    e.preventDefault();
    sessionStorage.setItem("platform_admin_key", apiKey);
    setAuthenticated(true);
    setError(null);
  }

  async function handleProvision(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await platformApi.provisionOrg(form);
      setShowForm(false);
      setForm({ subdomain: "", name: "", adminEmail: "", adminName: "", adminPassword: "" });
      mutate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Provisioning failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (!authenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950 px-4">
        <Card className="w-full max-w-md">
          <CardContent className="p-8">
            <div className="flex items-center gap-3 mb-6">
              <Shield size={24} className="text-violet-600" />
              <div>
                <h1 className="text-xl font-bold">Platform Admin</h1>
                <p className="text-sm text-zinc-500">Tenant provisioning console</p>
              </div>
            </div>
            <form onSubmit={handleAuth} className="space-y-4">
              <Field label="Platform Admin Key">
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Enter PLATFORM_ADMIN_SECRET"
                  className={inputClass}
                  required
                />
              </Field>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <Button type="submit" variant="primary" className="w-full">
                Authenticate
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <Building2 size={28} className="text-violet-600" />
            <div>
              <h1 className="text-2xl font-bold">Tenant Management</h1>
              <p className="text-sm text-zinc-500">DB-driven organization provisioning</p>
            </div>
          </div>
          <Button variant="primary" onClick={() => setShowForm(!showForm)} className="flex items-center gap-2">
            <Plus size={16} />
            New Organization
          </Button>
        </div>

        {showForm && (
          <Card className="mb-6">
            <CardContent className="p-6">
              <h2 className="font-semibold mb-4">Provision New Tenant</h2>
              <form onSubmit={handleProvision} className="grid grid-cols-2 gap-4">
                <Field label="Subdomain">
                  <input value={form.subdomain} onChange={(e) => setForm({ ...form, subdomain: e.target.value.toLowerCase() })} placeholder="acme" className={inputClass} required />
                </Field>
                <Field label="Organization Name">
                  <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} required />
                </Field>
                <Field label="Admin Name">
                  <input value={form.adminName} onChange={(e) => setForm({ ...form, adminName: e.target.value })} className={inputClass} required />
                </Field>
                <Field label="Admin Email">
                  <input type="email" value={form.adminEmail} onChange={(e) => setForm({ ...form, adminEmail: e.target.value })} className={inputClass} required />
                </Field>
                <Field label="Admin Password">
                  <input type="password" value={form.adminPassword} onChange={(e) => setForm({ ...form, adminPassword: e.target.value })} className={`${inputClass} col-span-2`} required />
                </Field>
                {error && <p className="text-sm text-red-600 col-span-2">{error}</p>}
                <div className="col-span-2 flex gap-2">
                  <Button type="submit" variant="primary" isDisabled={submitting}>
                    {submitting ? "Creating…" : "Create Organization"}
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>Cancel</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {isLoading ? (
          <p className="text-zinc-400">Loading organizations…</p>
        ) : orgs.length === 0 ? (
          <Card><CardContent className="p-12 text-center text-zinc-400">No organizations yet.</CardContent></Card>
        ) : (
          <div className="space-y-3">
            {orgs.map((org) => (
              <Card key={org.id}>
                <CardContent className="p-5 flex items-center gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-lg">{org.name}</h3>
                      <Chip size="sm" color={org.status === "active" ? "success" : "danger"} variant="soft">
                        {org.status}
                      </Chip>
                    </div>
                    <p className="text-sm text-zinc-500 mt-1">
                      <Globe size={12} className="inline mr-1" />
                      {org.subdomain} · {org.loginUrl}
                    </p>
                    {org.domains.length > 0 && (
                      <p className="text-xs text-zinc-400 mt-1">
                        Custom domains: {org.domains.map((d) => d.domain).join(", ")}
                      </p>
                    )}
                  </div>
                  <Chip size="sm" variant="secondary">{new Date(org.createdAt).toLocaleDateString()}</Chip>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
