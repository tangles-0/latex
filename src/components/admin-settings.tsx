"use client";

import { useState } from "react";

type AppSettings = {
  motd: string;
  costThisMonth: number;
  fundedThisMonth: number;
  donateUrl?: string;
  supportEnabled: boolean;
  signupsEnabled: boolean;
  uploadsEnabled: boolean;
  shareHtmlNavigationEnabled: boolean;
  resumableThresholdBytes: number;
};

type LegacyMigrationReport = {
  backend: "local" | "s3";
  checkedImages: number;
  migrated: number;
  skippedAlreadyMigrated: number;
  missingLegacySource: number;
  errors: number;
  migratedExamples: string[];
  skippedExamples: string[];
  missingExamples: string[];
  errorExamples: string[];
};

export default function AdminSettings({ initial }: { initial: AppSettings }) {
  const [motd, setMotd] = useState(initial.motd);
  const [cost, setCost] = useState(initial.costThisMonth);
  const [funded, setFunded] = useState(initial.fundedThisMonth);
  const [donateUrl, setDonateUrl] = useState(initial.donateUrl ?? "");
  const [supportEnabled, setSupportEnabled] = useState(initial.supportEnabled);
  const [signupsEnabled, setSignupsEnabled] = useState(initial.signupsEnabled);
  const [uploadsEnabled, setUploadsEnabled] = useState(initial.uploadsEnabled);
  const [shareHtmlNavigationEnabled, setShareHtmlNavigationEnabled] = useState(
    initial.shareHtmlNavigationEnabled,
  );
  const [resumableThresholdMb, setResumableThresholdMb] = useState(
    Math.max(1, Math.round(initial.resumableThresholdBytes / (1024 * 1024))),
  );
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [migrationBusy, setMigrationBusy] = useState(false);
  const [migrationError, setMigrationError] = useState<string | null>(null);
  const [migrationReport, setMigrationReport] = useState<LegacyMigrationReport | null>(null);

  async function save() {
    setError(null);
    setSaved(false);
    const response = await fetch("/api/admin/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        motd,
        costThisMonth: Number(cost),
        fundedThisMonth: Number(funded),
        donateUrl: donateUrl || null,
        supportEnabled,
        signupsEnabled,
        uploadsEnabled,
        shareHtmlNavigationEnabled,
        resumableThresholdBytes: Math.max(1024 * 1024, Number(resumableThresholdMb) * 1024 * 1024),
      }),
    });

    if (!response.ok) {
      const payload = (await response.json()) as { error?: string };
      setError(payload.error ?? "Unable to save settings.");
      return;
    }

    setSaved(true);
  }

  async function runLegacyMigration() {
    setMigrationBusy(true);
    setMigrationError(null);
    setMigrationReport(null);
    const response = await fetch("/api/admin/settings/migrate-legacy-images", {
      method: "POST",
    });
    if (!response.ok) {
      const payload = (await response.json()) as { error?: string };
      setMigrationError(payload.error ?? "Unable to run migration.");
      setMigrationBusy(false);
      return;
    }
    const payload = (await response.json()) as { report?: LegacyMigrationReport };
    setMigrationReport(payload.report ?? null);
    setMigrationBusy(false);
  }

  return (
    <section className="space-y-3 rounded border border-neutral-200 p-4">
      <h2 className="text-sm font-medium">Site settings</h2>
      <div className="space-y-2">
        <label className="text-xs text-neutral-500">MOTD</label>
        <textarea
          className="w-full rounded border px-3 py-2 text-xs"
          rows={3}
          value={motd}
          onChange={(event) => setMotd(event.target.value)}
        />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs">
          Cost this month
          <input
            className="rounded border px-3 py-2 text-xs"
            type="number"
            min={0}
            value={cost}
            onChange={(event) => setCost(Number(event.target.value))}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          Funded this month
          <input
            className="rounded border px-3 py-2 text-xs"
            type="number"
            min={0}
            value={funded}
            onChange={(event) => setFunded(Number(event.target.value))}
          />
        </label>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs">
          Donate URL
          <input
            className="rounded border px-3 py-2 text-xs"
            placeholder="https://..."
            value={donateUrl}
            onChange={(event) => setDonateUrl(event.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          Chunked upload threshold (MB)
          <input
            className="rounded border px-3 py-2 text-xs"
            type="number"
            min={1}
            value={resumableThresholdMb}
            onChange={(event) => setResumableThresholdMb(Math.max(1, Number(event.target.value) || 1))}
          />
        </label>
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={supportEnabled}
            onChange={(event) => setSupportEnabled(event.target.checked)}
          />
          Show support section
        </label>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={signupsEnabled}
            onChange={(event) => setSignupsEnabled(event.target.checked)}
          />
          Enable signups
        </label>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={uploadsEnabled}
            onChange={(event) => setUploadsEnabled(event.target.checked)}
          />
          Enable uploads
        </label>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={shareHtmlNavigationEnabled}
            onChange={(event) => setShareHtmlNavigationEnabled(event.target.checked)}
          />
          Keep `/share/...` URL on open (S3 backend only)
        </label>
      </div>
      <div className="flex items-center gap-3 text-xs">
        <button
          type="button"
          onClick={() => void save()}
          className="rounded bg-black px-3 py-2 text-white"
        >
          Save settings
        </button>
        {saved ? <span className="text-emerald-600">Saved</span> : null}
        {error ? <span className="text-red-600">{error}</span> : null}
      </div>

      <div className="space-y-2 rounded border border-neutral-200 p-3">
        <h3 className="text-xs font-medium">Legacy image storage migration</h3>
        <p className="text-[11px] text-neutral-500">
          Moves pre-media images from legacy storage paths into the new `/image/...` folder layout.
        </p>
        <div className="flex items-center gap-3 text-xs">
          <button
            type="button"
            onClick={() => void runLegacyMigration()}
            disabled={migrationBusy}
            className="rounded border border-neutral-200 px-3 py-2 disabled:opacity-50"
          >
            {migrationBusy ? "Running..." : "Run legacy migration"}
          </button>
          {migrationError ? <span className="text-red-600">{migrationError}</span> : null}
        </div>
        {migrationReport ? (
          <div className="space-y-2 rounded border border-dashed border-neutral-300 p-2 text-[11px]">
            <div className="grid gap-1 sm:grid-cols-2">
              <div>backend: {migrationReport.backend}</div>
              <div>images checked: {migrationReport.checkedImages}</div>
              <div>files migrated: {migrationReport.migrated}</div>
              <div>already migrated: {migrationReport.skippedAlreadyMigrated}</div>
              <div>missing legacy source: {migrationReport.missingLegacySource}</div>
              <div>errors: {migrationReport.errors}</div>
            </div>
            <details>
              <summary className="cursor-pointer font-medium">Show detailed output</summary>
              <pre className="mt-2 max-h-72 overflow-auto rounded bg-neutral-50 p-2 whitespace-pre-wrap">
{`Migrated examples:
${migrationReport.migratedExamples.join("\n") || "(none)"}

Skipped examples:
${migrationReport.skippedExamples.join("\n") || "(none)"}

Missing examples:
${migrationReport.missingExamples.join("\n") || "(none)"}

Error examples:
${migrationReport.errorExamples.join("\n") || "(none)"}`}
              </pre>
            </details>
          </div>
        ) : null}
      </div>

    </section>
  );
}

