import path from "path";
import { promises as fs } from "fs";
import { randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { db } from "@/db";
import { uploadSessions } from "@/db/schema";
import { contentTypeForExt } from "@/lib/media-types";

type StorageBackend = "local" | "s3";

const DATA_DIR = path.join(process.cwd(), "data");
const SESSION_DIR = path.join(DATA_DIR, "upload-sessions");
const STORAGE_BACKEND = (process.env.STORAGE_BACKEND as StorageBackend) || "local";
const S3_BUCKET = process.env.S3_BUCKET;
const S3_REGION = process.env.S3_REGION;
const S3_ENDPOINT = process.env.S3_ENDPOINT;
const MAX_SESSION_AGE_MS = 1000 * 60 * 60 * 24;
const STALE_UPLOAD_STATE_MS = 1000 * 60 * 15;

const s3Client =
  STORAGE_BACKEND === "s3" && S3_BUCKET && S3_REGION
    ? new S3Client({
        region: S3_REGION,
        endpoint: S3_ENDPOINT,
        forcePathStyle: Boolean(S3_ENDPOINT),
      })
    : null;

export type UploadSessionState = "initiated" | "uploading" | "finalizing" | "complete" | "failed";

export type UploadSessionEntry = {
  id: string;
  userId: string;
  backend: StorageBackend;
  fileName: string;
  fileSize: number;
  chunkSize: number;
  totalParts: number;
  mimeType: string;
  ext: string;
  checksum?: string;
  state: UploadSessionState;
  storageKey?: string;
  s3UploadId?: string;
  uploadedParts: Record<string, string>;
  createdAt: string;
  updatedAt: string;
};

type InitInput = {
  userId: string;
  fileName: string;
  fileSize: number;
  chunkSize: number;
  mimeType: string;
  ext: string;
  checksum?: string;
  targetType?: "image" | "video" | "document" | "other";
};

function mapSession(row: typeof uploadSessions.$inferSelect): UploadSessionEntry {
  let uploadedParts: Record<string, string> = {};
  try {
    uploadedParts = JSON.parse(row.uploadedPartsJson) as Record<string, string>;
  } catch {
    uploadedParts = {};
  }
  return {
    id: row.id,
    userId: row.userId,
    backend: row.backend as StorageBackend,
    fileName: row.fileName,
    fileSize: row.fileSize,
    chunkSize: row.chunkSize,
    totalParts: row.totalParts,
    mimeType: row.mimeType,
    ext: row.ext,
    checksum: row.checksum ?? undefined,
    state: row.state as UploadSessionState,
    storageKey: row.storageKey ?? undefined,
    s3UploadId: row.s3UploadId ?? undefined,
    uploadedParts,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function buildSessionStorageKey(id: string, ext: string, uploadedAt: Date): string {
  const year = uploadedAt.getUTCFullYear().toString();
  const month = String(uploadedAt.getUTCMonth() + 1).padStart(2, "0");
  const day = String(uploadedAt.getUTCDate()).padStart(2, "0");
  return path.posix.join("uploads", year, month, day, "original", `${id}.${ext}`);
}

function sessionPartsDir(id: string): string {
  return path.join(SESSION_DIR, id, "parts");
}

async function ensureSessionDirs(id: string): Promise<void> {
  await fs.mkdir(sessionPartsDir(id), { recursive: true });
}

export async function initUploadSession(input: InitInput): Promise<UploadSessionEntry> {
  if (input.checksum) {
    const existingRows = await db
      .select()
      .from(uploadSessions)
      .where(and(eq(uploadSessions.userId, input.userId), eq(uploadSessions.checksum, input.checksum)));
    const existing = existingRows
      .filter(
        (row) =>
          row.fileName === input.fileName &&
          row.fileSize === input.fileSize &&
          row.ext === input.ext &&
          row.mimeType === input.mimeType &&
          row.state !== "complete",
      )
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0];
    if (existing) {
      if (STORAGE_BACKEND === "local") {
        await ensureSessionDirs(existing.id);
      }
      return mapSession(existing);
    }
  }

  const sessionId = randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + MAX_SESSION_AGE_MS);
  const storageKey = buildSessionStorageKey(sessionId, input.ext, now);
  let s3UploadId: string | null = null;

  if (STORAGE_BACKEND === "local") {
    await ensureSessionDirs(sessionId);
  } else if (s3Client && S3_BUCKET) {
    const created = await s3Client.send(
      new CreateMultipartUploadCommand({
        Bucket: S3_BUCKET,
        Key: storageKey,
        ContentType: input.mimeType || contentTypeForExt(input.ext),
      }),
    );
    s3UploadId = created.UploadId ?? null;
  }

  await db.insert(uploadSessions).values({
    id: sessionId,
    userId: input.userId,
    backend: STORAGE_BACKEND,
    targetType: input.targetType ?? "other",
    mimeType: input.mimeType,
    ext: input.ext,
    checksum: input.checksum ?? null,
    fileName: input.fileName,
    fileSize: input.fileSize,
    chunkSize: input.chunkSize,
    totalParts: Math.ceil(input.fileSize / input.chunkSize),
    state: "initiated",
    storageKey,
    s3UploadId,
    uploadedPartsJson: "{}",
    expiresAt,
    createdAt: now,
    updatedAt: now,
  });

  const session = await getUploadSessionForUser(sessionId, input.userId);
  if (!session) {
    throw new Error("Upload session could not be created.");
  }
  return session;
}

export async function listIncompleteUploadSessionsForUser(userId: string): Promise<UploadSessionEntry[]> {
  await sweepStaleUploadSessionsForUser(userId);
  const rows = await db.select().from(uploadSessions).where(eq(uploadSessions.userId, userId));
  return rows
    .filter((row) => row.state !== "complete")
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
    .map((row) => mapSession(row));
}

export async function clearUploadSessionsForUser(
  userId: string,
  sessionIds: string[],
): Promise<{ cleared: number }> {
  if (sessionIds.length === 0) {
    return { cleared: 0 };
  }
  const rows = await db
    .select()
    .from(uploadSessions)
    .where(and(eq(uploadSessions.userId, userId), eq(uploadSessions.state, "failed")));
  const targetIds = new Set(sessionIds);
  const targets = rows.filter((row) => targetIds.has(row.id));

  for (const row of targets) {
    const mapped = mapSession(row);
    if (mapped.backend === "local") {
      await fs.rm(path.join(SESSION_DIR, mapped.id), { recursive: true, force: true });
    } else if (s3Client && S3_BUCKET && mapped.storageKey && mapped.s3UploadId) {
      try {
        await s3Client.send(
          new AbortMultipartUploadCommand({
            Bucket: S3_BUCKET,
            Key: mapped.storageKey,
            UploadId: mapped.s3UploadId,
          }),
        );
      } catch {
        // Ignore stale/unknown multipart sessions during cleanup.
      }
    }
    await db.delete(uploadSessions).where(eq(uploadSessions.id, mapped.id));
  }
  return { cleared: targets.length };
}

export async function markUploadSessionFailedForUser(
  sessionId: string,
  userId: string,
  reason: string,
): Promise<void> {
  await db
    .update(uploadSessions)
    .set({
      state: "failed",
      error: reason.slice(0, 500),
      updatedAt: new Date(),
    })
    .where(and(eq(uploadSessions.id, sessionId), eq(uploadSessions.userId, userId)));
}

export async function sweepStaleUploadSessionsForUser(userId: string): Promise<number> {
  const now = Date.now();
  const rows = await db.select().from(uploadSessions).where(eq(uploadSessions.userId, userId));
  const stale = rows.filter((row) => {
    if (row.state !== "initiated" && row.state !== "uploading" && row.state !== "finalizing") {
      return false;
    }
    return now - row.updatedAt.getTime() > STALE_UPLOAD_STATE_MS;
  });

  for (const row of stale) {
    await db
      .update(uploadSessions)
      .set({
        state: "failed",
        error: "stale timeout",
        updatedAt: new Date(),
      })
      .where(and(eq(uploadSessions.id, row.id), eq(uploadSessions.userId, userId)));
  }
  return stale.length;
}

export async function getUploadSessionForUser(
  sessionId: string,
  userId: string,
): Promise<UploadSessionEntry | undefined> {
  const [row] = await db
    .select()
    .from(uploadSessions)
    .where(and(eq(uploadSessions.id, sessionId), eq(uploadSessions.userId, userId)))
    .limit(1);
  if (!row) {
    return undefined;
  }
  return mapSession(row);
}

async function patchUploadedParts(
  session: UploadSessionEntry,
  partNumber: number,
  etag: string,
  state: UploadSessionState = "uploading",
): Promise<void> {
  const nextParts = {
    ...session.uploadedParts,
    [String(partNumber)]: etag,
  };
  await db
    .update(uploadSessions)
    .set({
      uploadedPartsJson: JSON.stringify(nextParts),
      state,
      updatedAt: new Date(),
    })
    .where(eq(uploadSessions.id, session.id));
}

export async function uploadSessionPart(
  session: UploadSessionEntry,
  partNumber: number,
  data: Buffer,
): Promise<{ etag: string }> {
  if (partNumber < 1 || partNumber > session.totalParts) {
    throw new Error("Invalid part number.");
  }

  if (session.backend === "local") {
    await ensureSessionDirs(session.id);
    const partPath = path.join(sessionPartsDir(session.id), `${partNumber}.part`);
    await fs.writeFile(partPath, data);
    const etag = `${data.length}-${partNumber}`;
    await patchUploadedParts(session, partNumber, etag);
    return { etag };
  }

  if (!s3Client || !S3_BUCKET || !session.storageKey || !session.s3UploadId) {
    throw new Error("S3 upload session is not configured.");
  }

  const uploaded = await s3Client.send(
    new UploadPartCommand({
      Bucket: S3_BUCKET,
      Key: session.storageKey,
      UploadId: session.s3UploadId,
      PartNumber: partNumber,
      Body: data,
    }),
  );
  const etag = uploaded.ETag ?? "";
  await patchUploadedParts(session, partNumber, etag);
  return { etag };
}

export async function completeUploadSession(session: UploadSessionEntry): Promise<UploadSessionEntry> {
  await db
    .update(uploadSessions)
    .set({ state: "finalizing", updatedAt: new Date() })
    .where(eq(uploadSessions.id, session.id));

  const refreshed = await getUploadSessionForUser(session.id, session.userId);
  if (!refreshed) {
    throw new Error("Upload session not found.");
  }

  if (refreshed.backend === "local") {
    const dir = sessionPartsDir(refreshed.id);
    const outPath = path.join(DATA_DIR, refreshed.storageKey ?? "");
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    const ordered = Object.keys(refreshed.uploadedParts)
      .map((key) => Number(key))
      .filter((n) => Number.isFinite(n))
      .sort((a, b) => a - b);
    const buffers: Buffer[] = [];
    for (const partNumber of ordered) {
      const partPath = path.join(dir, `${partNumber}.part`);
      buffers.push(await fs.readFile(partPath));
    }
    await fs.writeFile(outPath, Buffer.concat(buffers));
    await fs.rm(path.join(SESSION_DIR, refreshed.id), { recursive: true, force: true });
  } else {
    if (!s3Client || !S3_BUCKET || !refreshed.storageKey || !refreshed.s3UploadId) {
      throw new Error("S3 upload session is not configured.");
    }
    const parts = Object.entries(refreshed.uploadedParts)
      .map(([partNumber, etag]) => ({
        ETag: etag,
        PartNumber: Number(partNumber),
      }))
      .filter((item) => Number.isFinite(item.PartNumber))
      .sort((a, b) => a.PartNumber - b.PartNumber);
    await s3Client.send(
      new CompleteMultipartUploadCommand({
        Bucket: S3_BUCKET,
        Key: refreshed.storageKey,
        UploadId: refreshed.s3UploadId,
        MultipartUpload: { Parts: parts },
      }),
    );
  }

  await db
    .update(uploadSessions)
    .set({ state: "complete", updatedAt: new Date() })
    .where(eq(uploadSessions.id, session.id));
  const completed = await getUploadSessionForUser(session.id, session.userId);
  if (!completed) {
    throw new Error("Upload completion failed.");
  }
  return completed;
}

export async function abortUploadSession(session: UploadSessionEntry): Promise<void> {
  if (session.backend === "local") {
    await fs.rm(path.join(SESSION_DIR, session.id), { recursive: true, force: true });
  } else if (s3Client && S3_BUCKET && session.storageKey && session.s3UploadId) {
    await s3Client.send(
      new AbortMultipartUploadCommand({
        Bucket: S3_BUCKET,
        Key: session.storageKey,
        UploadId: session.s3UploadId,
      }),
    );
  }
  await db
    .update(uploadSessions)
    .set({ state: "failed", error: "aborted", updatedAt: new Date() })
    .where(eq(uploadSessions.id, session.id));
}

export function getCompletedUploadPath(session: UploadSessionEntry): string {
  if (!session.storageKey) {
    throw new Error("Missing storage key.");
  }
  return path.join(DATA_DIR, session.storageKey);
}

