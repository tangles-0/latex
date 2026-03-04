"use client";

import { useState } from "react";

type ImportResponse = {
  message?: string;
  error?: string;
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

type DbBackupReport = {
  fileName: string;
  backend: "local" | "s3";
  storagePath: string;
  tableCount: number;
  totalRows: number;
  tables: Array<{ tableName: string; rowCount: number }>;
};

export default function AdminDatabase() {
  const [file, setFile] = useState<File | null>(null);
  const [s3Key, setS3Key] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [backupBusy, setBackupBusy] = useState(false);
  const [backupError, setBackupError] = useState<string | null>(null);
  const [backupReport, setBackupReport] = useState<DbBackupReport | null>(null);

  const [migrationBusy, setMigrationBusy] = useState(false);
  const [migrationError, setMigrationError] = useState<string | null>(null);
  const [migrationReport, setMigrationReport] = useState<LegacyMigrationReport | null>(null);

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

  async function runDatabaseBackup() {
    setBackupBusy(true);
    setBackupError(null);
    setBackupReport(null);
    const response = await fetch("/api/admin/settings/db-backup", {
      method: "POST",
    });
    if (!response.ok) {
      const payload = (await response.json()) as { error?: string };
      setBackupError(payload.error ?? "Unable to create backup.");
      setBackupBusy(false);
      return;
    }
    const payload = (await response.json()) as { backup?: DbBackupReport };
    setBackupReport(payload.backup ?? null);
    setBackupBusy(false);
  }

  async function runImport() {
    const trimmedKey = s3Key.trim();
    if (!file && !trimmedKey) {
      setError("Choose a .sql/.dump file or enter an S3 object key.");
      return;
    }

    setError(null);
    setMessage(null);
    setIsUploading(true);
    try {
      const response = file
        ? await (async () => {
          const formData = new FormData();
          formData.append("dump", file);
          if (trimmedKey) {
            formData.append("s3Key", trimmedKey);
          }
          return fetch("/api/admin/settings/db-import", {
            method: "POST",
            body: formData,
          });
        })()
        : await fetch("/api/admin/settings/db-import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ s3Key: trimmedKey }),
        });

      const payload = (await response.json()) as ImportResponse;
      if (!response.ok) {
        setError(payload.error ?? "Import failed.");
        return;
      }
      setMessage(payload.message ?? "Import completed.");
    } catch {
      setError("Import failed.");
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <>
      <section className="space-y-3 rounded border border-neutral-200 p-4">
        <h2 className="text-sm font-medium">Database Import</h2>
        <p className="text-xs text-neutral-600">
          Upload a `.sql` or `.dump` PostgreSQL dump file to import. The server runs `psql` or `pg_restore`
          against the current database to restore the data.
        </p>
        <p className="text-xs text-red-600">NOTE: `IS_ENABLED = true;` must be set in `/src/app/api/admin/settings/db-import/route.ts` to enable this unsafe feature.</p>
        <label className="flex flex-col gap-2 text-xs">
          S3 object key (optional)
          <input
            type="text"
            placeholder="migration-artifacts/latex-20260219T141457Z.dump"
            value={s3Key}
            onChange={(event) => setS3Key(event.target.value)}
            className="rounded border px-3 py-2 text-xs"
          />
        </label>
        <label className="flex flex-col gap-2 text-xs">
          Dump file (optional)
          <input
            type="file"
            accept=".sql,.dump,text/sql,application/sql,application/octet-stream"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            className="rounded border px-3 py-2 text-xs"
          />
        </label>
        <div className="flex items-center gap-3 text-xs">
          <button
            type="button"
            disabled={isUploading}
            onClick={() => void runImport()}
            className="rounded bg-black px-3 py-2 text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isUploading ? "Importing..." : "Import dump"}
          </button>
          {message ? <span className="text-emerald-600">{message}</span> : null}
          {error ? <span className="text-red-600">{error}</span> : null}
        </div>
      </section>

      <section className="space-y-3 rounded border border-neutral-200 p-4">
        <div className="space-y-2  p-3">
          <h3 className="text-xs font-medium">Create DB backup</h3>
          <p className="text-[11px] text-neutral-500">
            Generates a data-only `.sql` backup by reading all public tables and saves it to storage root.
          </p>
          <p className="text-xs text-red-600">NOTE: `IS_ENABLED = true;` must be set in `/src/app/api/admin/settings/db-backup/route.ts` to enable this unsafe feature.</p>
          <div className="flex items-center gap-3 text-xs">
            <button
              type="button"
              onClick={() => void runDatabaseBackup()}
              disabled={backupBusy}
              className="rounded border border-neutral-200 px-3 py-2 disabled:opacity-50"
            >
              {backupBusy ? "Creating backup..." : "Create SQL backup"}
            </button>
            {backupError ? <span className="text-red-600">{backupError}</span> : null}
          </div>
          {backupReport ? (
            <div className="space-y-2 rounded border border-dashed border-neutral-300 p-2 text-[11px]">
              <div className="grid gap-1 sm:grid-cols-2">
                <div>backend: {backupReport.backend}</div>
                <div>file: {backupReport.fileName}</div>
                <div>storage path: {backupReport.storagePath}</div>
                <div>tables: {backupReport.tableCount}</div>
                <div>total rows: {backupReport.totalRows}</div>
              </div>
              <details>
                <summary className="cursor-pointer font-medium">Show table row counts</summary>
                <pre className="mt-2 max-h-72 overflow-auto rounded bg-neutral-50 p-2 whitespace-pre-wrap">
                  {backupReport.tables.map((entry) => `${entry.tableName}: ${entry.rowCount}`).join("\n") || "(none)"}
                </pre>
              </details>
            </div>
          ) : null}
        </div>
      </section>

      <section className="space-y-3 rounded border border-neutral-200 p-4">
        <div className="space-y-2 p-3">
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

    </>
  );
}
