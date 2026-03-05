import path from "path";
import os from "os";
import { createReadStream, promises as fs } from "fs";
import { execFile } from "child_process";
import { Readable } from "stream";
import { promisify } from "util";
import sharp from "sharp";
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  CODE_EXTENSIONS,
  CSV_EXTENSIONS,
  DOCUMENT_TEXT_EXTENSIONS,
  PRESENTATION_EXTENSIONS,
  SPREADSHEET_EXTENSIONS,
  contentTypeForExt,
} from "@/lib/media-types";

type StorageBackend = "local" | "s3";
export type MediaSize = "original" | "sm" | "lg";
export type StoredMediaResult = {
  baseName: string;
  ext: string;
  mimeType: string;
  width?: number;
  height?: number;
  sizeOriginal: number;
  sizeSm: number;
  sizeLg: number;
  previewStatus: "pending" | "ready" | "failed";
};

const DATA_DIR = path.join(process.cwd(), "data");
const STORAGE_BACKEND = (process.env.STORAGE_BACKEND as StorageBackend) || "local";
const S3_BUCKET = process.env.S3_BUCKET;
const S3_REGION = process.env.S3_REGION;
const S3_ENDPOINT = process.env.S3_ENDPOINT;
const s3Client =
  STORAGE_BACKEND === "s3" && S3_BUCKET && S3_REGION
    ? new S3Client({
        region: S3_REGION,
        endpoint: S3_ENDPOINT,
        forcePathStyle: Boolean(S3_ENDPOINT),
      })
    : null;
const execFileAsync = promisify(execFile);
function formatProcessError(error: unknown): string {
  if (!error || typeof error !== "object") {
    return "Unknown process error.";
  }
  const maybeError = error as {
    message?: unknown;
    code?: unknown;
    stdout?: unknown;
    stderr?: unknown;
  };
  const parts: string[] = [];
  if (typeof maybeError.message === "string" && maybeError.message.trim().length > 0) {
    parts.push(maybeError.message.trim());
  }
  if (typeof maybeError.code === "string" && maybeError.code.trim().length > 0) {
    parts.push(`code=${maybeError.code}`);
  } else if (typeof maybeError.code === "number") {
    parts.push(`code=${String(maybeError.code)}`);
  }
  if (typeof maybeError.stderr === "string" && maybeError.stderr.trim().length > 0) {
    parts.push(`stderr=${maybeError.stderr.trim()}`);
  }
  if (parts.length > 0) {
    return parts.join(" | ");
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Unknown process error.";
}

const MEDIA_DIRECT_URL_TTL_SECONDS = Number.parseInt(
  process.env.MEDIA_DIRECT_URL_TTL_SECONDS ?? "120",
  10,
);
const TMP_CANDIDATES = [
  process.env.TANGLEPIC_TMP_DIR,
  "/dev/shm",
  "/var/tmp",
  os.tmpdir(),
  path.join(process.cwd(), "data", "tmp"),
].filter((value): value is string => Boolean(value && value.trim().length > 0));

function toWebReadableStream(body: unknown): ReadableStream<Uint8Array> {
  if (!body) {
    throw new Error("Storage response body is empty.");
  }
  if (typeof (body as { transformToWebStream?: unknown }).transformToWebStream === "function") {
    return (body as { transformToWebStream: () => ReadableStream<Uint8Array> }).transformToWebStream();
  }
  if (body instanceof Readable) {
    return Readable.toWeb(body) as ReadableStream<Uint8Array>;
  }
  if (typeof (body as { getReader?: unknown }).getReader === "function") {
    return body as ReadableStream<Uint8Array>;
  }
  if (typeof (body as { [Symbol.asyncIterator]?: unknown })[Symbol.asyncIterator] === "function") {
    const iterator = (body as AsyncIterable<Uint8Array>)[Symbol.asyncIterator]();
    return new ReadableStream<Uint8Array>({
      async pull(controller) {
        const next = await iterator.next();
        if (next.done) {
          controller.close();
          return;
        }
        controller.enqueue(next.value);
      },
      async cancel() {
        if (typeof iterator.return === "function") {
          await iterator.return();
        }
      },
    });
  }
  throw new Error("Unsupported storage response stream type.");
}

async function readWebStreamToBuffer(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  const reader = stream.getReader();
  const chunks: Buffer[] = [];
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) {
        break;
      }
      if (result.value) {
        chunks.push(Buffer.from(result.value));
      }
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
}

function datePathParts(uploadedAt: Date): { year: string; month: string; day: string } {
  return {
    year: String(uploadedAt.getUTCFullYear()),
    month: String(uploadedAt.getUTCMonth() + 1).padStart(2, "0"),
    day: String(uploadedAt.getUTCDate()).padStart(2, "0"),
  };
}

function buildStorageKey(
  kind: string,
  baseName: string,
  ext: string,
  size: MediaSize,
  uploadedAt: Date,
): string {
  const { year, month, day } = datePathParts(uploadedAt);
  return path.posix.join("uploads", year, month, day, kind, size, `${baseName}.${ext}`);
}

async function createWorkingDir(prefix: string): Promise<string> {
  let lastError: Error | null = null;
  for (const candidate of TMP_CANDIDATES) {
    try {
      await fs.mkdir(candidate, { recursive: true });
      return await fs.mkdtemp(path.join(candidate, prefix));
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Unable to create temp directory.");
    }
  }
  throw lastError ?? new Error("Unable to create temp directory.");
}

function mediaDirectUrlTtlSeconds(): number {
  if (!Number.isFinite(MEDIA_DIRECT_URL_TTL_SECONDS) || MEDIA_DIRECT_URL_TTL_SECONDS <= 0) {
    return 120;
  }
  return Math.max(30, Math.min(900, MEDIA_DIRECT_URL_TTL_SECONDS));
}

function mediaStorageKey(input: {
  kind: "image" | "video" | "document" | "other";
  baseName: string;
  ext: string;
  size: MediaSize;
  uploadedAt: Date;
}): string {
  const requestedExt = input.kind === "image" || input.size === "original" ? input.ext : "png";
  return buildStorageKey(input.kind, input.baseName, requestedExt, input.size, input.uploadedAt);
}

export function usesS3StorageBackend(): boolean {
  return STORAGE_BACKEND === "s3" && Boolean(s3Client && S3_BUCKET);
}

function absolutePathForKey(key: string): string {
  return path.join(DATA_DIR, key);
}

export function buildMediaBaseName(uploadedAt: Date): string {
  const iso = uploadedAt.toISOString().replace(/[:.]/g, "-");
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${iso}-${suffix}`;
}

async function writeKey(key: string, ext: string, data: Buffer): Promise<void> {
  if (STORAGE_BACKEND === "s3") {
    if (!s3Client || !S3_BUCKET) {
      throw new Error("S3 is not configured.");
    }
    await s3Client.send(
      new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: key,
        Body: data,
        ContentType: contentTypeForExt(ext),
      }),
    );
    return;
  }
  const filePath = absolutePathForKey(key);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, data);
}

function toCopySourceKey(key: string): string {
  return encodeURIComponent(key).replace(/%2F/g, "/");
}

async function copyKey(sourceKey: string, targetKey: string, ext: string): Promise<void> {
  if (sourceKey === targetKey) {
    return;
  }
  if (STORAGE_BACKEND === "s3") {
    if (!s3Client || !S3_BUCKET) {
      throw new Error("S3 is not configured.");
    }
    await s3Client.send(
      new CopyObjectCommand({
        Bucket: S3_BUCKET,
        CopySource: `${S3_BUCKET}/${toCopySourceKey(sourceKey)}`,
        Key: targetKey,
        ContentType: contentTypeForExt(ext),
      }),
    );
    return;
  }
  const sourcePath = absolutePathForKey(sourceKey);
  const targetPath = absolutePathForKey(targetKey);
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.copyFile(sourcePath, targetPath);
}

async function deleteKey(key: string): Promise<void> {
  if (STORAGE_BACKEND === "s3") {
    if (!s3Client || !S3_BUCKET) {
      throw new Error("S3 is not configured.");
    }
    await s3Client.send(
      new DeleteObjectCommand({
        Bucket: S3_BUCKET,
        Key: key,
      }),
    );
    return;
  }
  await fs.rm(absolutePathForKey(key), { force: true });
}

async function readKey(key: string): Promise<Buffer> {
  if (STORAGE_BACKEND === "s3") {
    if (!s3Client || !S3_BUCKET) {
      throw new Error("S3 is not configured.");
    }
    const response = await s3Client.send(
      new GetObjectCommand({
        Bucket: S3_BUCKET,
        Key: key,
      }),
    );
    return readWebStreamToBuffer(toWebReadableStream(response.Body));
  }
  return fs.readFile(absolutePathForKey(key));
}

async function getKeySize(key: string): Promise<number> {
  if (STORAGE_BACKEND === "s3") {
    if (!s3Client || !S3_BUCKET) {
      throw new Error("S3 is not configured.");
    }
    const head = await s3Client.send(
      new HeadObjectCommand({
        Bucket: S3_BUCKET,
        Key: key,
      }),
    );
    return Number(head.ContentLength ?? 0);
  }
  const stats = await fs.stat(absolutePathForKey(key));
  return Number(stats.size ?? 0);
}

async function readKeyRange(key: string, start: number, end: number): Promise<Buffer> {
  if (STORAGE_BACKEND === "s3") {
    if (!s3Client || !S3_BUCKET) {
      throw new Error("S3 is not configured.");
    }
    const response = await s3Client.send(
      new GetObjectCommand({
        Bucket: S3_BUCKET,
        Key: key,
        Range: `bytes=${start}-${end}`,
      }),
    );
    return readWebStreamToBuffer(toWebReadableStream(response.Body));
  }
  const length = end - start + 1;
  const handle = await fs.open(absolutePathForKey(key), "r");
  try {
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, start);
    return buffer;
  } finally {
    await handle.close();
  }
}

async function readKeyStream(key: string): Promise<ReadableStream<Uint8Array>> {
  if (STORAGE_BACKEND === "s3") {
    if (!s3Client || !S3_BUCKET) {
      throw new Error("S3 is not configured.");
    }
    const response = await s3Client.send(
      new GetObjectCommand({
        Bucket: S3_BUCKET,
        Key: key,
      }),
    );
    return toWebReadableStream(response.Body);
  }
  return Readable.toWeb(createReadStream(absolutePathForKey(key))) as ReadableStream<Uint8Array>;
}

async function readKeyRangeStream(
  key: string,
  start: number,
  end: number,
): Promise<ReadableStream<Uint8Array>> {
  if (STORAGE_BACKEND === "s3") {
    if (!s3Client || !S3_BUCKET) {
      throw new Error("S3 is not configured.");
    }
    const response = await s3Client.send(
      new GetObjectCommand({
        Bucket: S3_BUCKET,
        Key: key,
        Range: `bytes=${start}-${end}`,
      }),
    );
    return toWebReadableStream(response.Body);
  }
  return Readable.toWeb(createReadStream(absolutePathForKey(key), { start, end })) as ReadableStream<Uint8Array>;
}

function asPreviewPng(_text: string): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="768">
  <rect width="100%" height="100%" fill="#111827"/>
  <rect x="24" y="24" width="976" height="720" rx="18" fill="#1f2937" stroke="#374151"/>
  <rect x="120" y="180" width="784" height="34" rx="8" fill="#334155"/>
  <rect x="120" y="240" width="680" height="22" rx="8" fill="#475569"/>
  <rect x="120" y="282" width="720" height="22" rx="8" fill="#475569"/>
  <rect x="120" y="324" width="610" height="22" rx="8" fill="#475569"/>
  <rect x="120" y="366" width="540" height="22" rx="8" fill="#475569"/>
  <rect x="120" y="440" width="420" height="18" rx="8" fill="#64748b"/>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

function escapeXml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function asTextPreviewPng(label: string, text: string): Promise<Buffer> {
  const lines = text
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.replace(/[^\x09\x20-\x7E]/g, " "))
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0)
    .slice(0, 18);
  const paddedLines = lines.length > 0 ? lines : ["(empty file)"];
  const lineNodes = paddedLines
    .map(
      (line, index) =>
        `<text x="56" y="${190 + index * 30}" font-size="24" fill="#d1d5db" font-family="monospace">${escapeXml(line.slice(0, 88))}</text>`,
    )
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="768">
  <rect width="100%" height="100%" fill="#0f172a"/>
  <rect x="24" y="24" width="976" height="720" rx="18" fill="#111827" stroke="#1f2937"/>
  <text x="56" y="116" font-size="44" fill="#93c5fd" font-family="Arial, sans-serif">${escapeXml(label)}</text>
  ${lineNodes}
  </svg>`;
  try {
    console.log("Generating text preview PNG with fontconfig.");
    return await sharp(Buffer.from(svg)).png().toBuffer();
  } catch {
    // Fall back to a font-free placeholder if fontconfig is unavailable.
    console.warn("Fontconfig is unavailable, falling back to a font-free placeholder.");
    return asPreviewPng("File Preview");
  }
}

async function tryGeneratePdfPreview(buffer: Buffer): Promise<Buffer | null> {
  const tmpDir = await createWorkingDir("tanglepic-pdf-");
  const inputPath = path.join(tmpDir, "input.pdf");
  const outputPrefix = path.join(tmpDir, "preview");
  const outputPath = `${outputPrefix}.png`;
  try {
    await fs.writeFile(inputPath, buffer);
    await execFileAsync("pdftoppm", ["-f", "1", "-singlefile", "-png", inputPath, outputPrefix], {
      timeout: 20_000,
    });
    return await fs.readFile(outputPath);
  } catch (error) {
    console.warn(`[document-preview] PDF preview generation failed: ${formatProcessError(error)}`);
    return null;
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

async function tryGenerateOfficePreview(buffer: Buffer, ext: string): Promise<Buffer | null> {
  const tmpDir = await createWorkingDir("tanglepic-office-");
  const inputPath = path.join(tmpDir, `input.${ext}`);
  const pdfPath = path.join(tmpDir, "input.pdf");
  const outputPrefix = path.join(tmpDir, "preview");
  const outputPath = `${outputPrefix}.png`;
  const officeProfilePath = path.join(tmpDir, "lo-profile");
  const officeProfileUri = `file://${officeProfilePath}`;
  try {
    await fs.mkdir(officeProfilePath, { recursive: true });
    await fs.writeFile(inputPath, buffer);
    await execFileAsync(
      "soffice",
      [
        "--headless",
        "--invisible",
        "--nologo",
        "--nodefault",
        "--nolockcheck",
        "--norestore",
        `-env:UserInstallation=${officeProfileUri}`,
        "--convert-to",
        "pdf:writer_pdf_Export",
        "--outdir",
        tmpDir,
        inputPath,
      ],
      {
        timeout: 20_000,
        env: {
          ...process.env,
          HOME: tmpDir,
          TMPDIR: tmpDir,
        },
      },
    );
    await execFileAsync("pdftoppm", ["-f", "1", "-singlefile", "-png", pdfPath, outputPrefix], {
      timeout: 20_000,
    });
    return await fs.readFile(outputPath);
  } catch (error) {
    console.warn(
      `[document-preview] Office preview generation failed for .${ext}: ${formatProcessError(error)}`,
    );
    return null;
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

async function tryGenerateDocumentPreview(
  buffer: Buffer,
  ext: string,
  mimeType: string,
): Promise<Buffer | null> {
  const normalizedExt = ext.toLowerCase();
  const normalizedMime = mimeType.toLowerCase();

  if (normalizedExt === "pdf" || normalizedMime === "application/pdf") {
    return tryGeneratePdfPreview(buffer);
  }

  if (
    normalizedMime.startsWith("text/") ||
    CSV_EXTENSIONS.has(normalizedExt) ||
    CODE_EXTENSIONS.has(normalizedExt) ||
    normalizedExt === "txt" ||
    normalizedExt === "text"
  ) {
    return asTextPreviewPng(`${normalizedExt.toUpperCase()} preview`, buffer.toString("utf8", 0, 256 * 1024));
  }

  const officeConvertibleExtensions = new Set([
    ...DOCUMENT_TEXT_EXTENSIONS,
    ...SPREADSHEET_EXTENSIONS,
    ...PRESENTATION_EXTENSIONS,
  ]);
  if (
    officeConvertibleExtensions.has(normalizedExt) ||
    normalizedMime.includes("officedocument") ||
    normalizedMime.includes("msword") ||
    normalizedMime.includes("ms-excel") ||
    normalizedMime.includes("powerpoint") ||
    normalizedMime.includes("opendocument") ||
    normalizedMime.includes("rtf")
  ) {
    return tryGenerateOfficePreview(buffer, normalizedExt);
  }

  return null;
}

async function tryGenerateVideoPreviewFromSource(source: string): Promise<Buffer | null> {
  const tmpDir = await createWorkingDir("tanglepic-video-preview-");
  const outputPath = path.join(tmpDir, "preview.png");
  try {
    await execFileAsync(
      "ffmpeg",
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-nostdin",
        "-threads",
        "1",
        "-ss",
        "00:00:01",
        "-i",
        source,
        "-frames:v",
        "1",
        "-vf",
        "scale='min(1024,iw)':-2:flags=lanczos",
        "-an",
        "-sn",
        "-dn",
        "-y",
        outputPath,
      ],
      { timeout: 30_000 },
    );
    return await fs.readFile(outputPath);
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown ffmpeg error";
    console.warn(`ffmpeg thumbnail generation failed: ${details}`);
    return null;
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

export async function storeGenericMediaFromBuffer(input: {
  kind: "video" | "document" | "other";
  buffer: Buffer;
  ext: string;
  mimeType: string;
  uploadedAt: Date;
  deferPreview?: boolean;
}): Promise<StoredMediaResult> {
  const baseName = buildMediaBaseName(input.uploadedAt);
  const originalKey = buildStorageKey(input.kind, baseName, input.ext, "original", input.uploadedAt);
  await writeKey(originalKey, input.ext, input.buffer);
  const sizeOriginal = input.buffer.length;

  if (input.kind === "video" && input.deferPreview) {
    return {
      baseName,
      ext: input.ext,
      mimeType: input.mimeType,
      sizeOriginal,
      sizeSm: 0,
      sizeLg: 0,
      previewStatus: "pending",
    };
  }

  let lgBuffer: Buffer;
  if (input.kind === "document") {
    const preview = await tryGenerateDocumentPreview(input.buffer, input.ext, input.mimeType);
    if (!preview) {
      return {
        baseName,
        ext: input.ext,
        mimeType: input.mimeType,
        sizeOriginal,
        sizeSm: 0,
        sizeLg: 0,
        previewStatus: "failed",
      };
    }
    lgBuffer = await sharp(preview).resize({ width: 1024, withoutEnlargement: true }).png().toBuffer();
  } else {
    lgBuffer = await asPreviewPng("File Preview");
  }
  const smBuffer = await sharp(lgBuffer).resize({ width: 320, withoutEnlargement: true }).png().toBuffer();

  const smKey = buildStorageKey(input.kind, baseName, "png", "sm", input.uploadedAt);
  const lgKey = buildStorageKey(input.kind, baseName, "png", "lg", input.uploadedAt);
  await writeKey(smKey, "png", smBuffer);
  await writeKey(lgKey, "png", lgBuffer);

  return {
    baseName,
    ext: input.ext,
    mimeType: input.mimeType,
    sizeOriginal,
    sizeSm: smBuffer.length,
    sizeLg: lgBuffer.length,
    previewStatus: "ready",
  };
}

const MAX_INLINE_PREVIEW_BYTES = 512 * 1024 * 1024;

export async function storeGenericMediaFromStoredUpload(input: {
  kind: "video" | "document" | "other";
  sourceKey: string;
  sizeOriginal: number;
  ext: string;
  mimeType: string;
  uploadedAt: Date;
  deferPreview?: boolean;
}): Promise<StoredMediaResult> {
  const baseName = buildMediaBaseName(input.uploadedAt);
  const originalKey = buildStorageKey(input.kind, baseName, input.ext, "original", input.uploadedAt);
  await copyKey(input.sourceKey, originalKey, input.ext);
  if (input.sourceKey !== originalKey) {
    await deleteKey(input.sourceKey);
  }

  if (input.kind === "video" && input.deferPreview) {
    return {
      baseName,
      ext: input.ext,
      mimeType: input.mimeType,
      sizeOriginal: input.sizeOriginal,
      sizeSm: 0,
      sizeLg: 0,
      previewStatus: "pending",
    };
  }

  let lgBuffer: Buffer;
  if (input.kind === "document") {
    if (input.sizeOriginal > MAX_INLINE_PREVIEW_BYTES) {
      return {
        baseName,
        ext: input.ext,
        mimeType: input.mimeType,
        sizeOriginal: input.sizeOriginal,
        sizeSm: 0,
        sizeLg: 0,
        previewStatus: "failed",
      };
    }
    const sourceBuffer = await readKey(originalKey);
    const preview = await tryGenerateDocumentPreview(sourceBuffer, input.ext, input.mimeType);
    if (!preview) {
      return {
        baseName,
        ext: input.ext,
        mimeType: input.mimeType,
        sizeOriginal: input.sizeOriginal,
        sizeSm: 0,
        sizeLg: 0,
        previewStatus: "failed",
      };
    }
    lgBuffer = await sharp(preview).resize({ width: 1024, withoutEnlargement: true }).png().toBuffer();
  } else {
    lgBuffer = await asPreviewPng("File Preview");
  }
  const smBuffer = await sharp(lgBuffer).resize({ width: 320, withoutEnlargement: true }).png().toBuffer();
  const smKey = buildStorageKey(input.kind, baseName, "png", "sm", input.uploadedAt);
  const lgKey = buildStorageKey(input.kind, baseName, "png", "lg", input.uploadedAt);
  await writeKey(smKey, "png", smBuffer);
  await writeKey(lgKey, "png", lgBuffer);

  return {
    baseName,
    ext: input.ext,
    mimeType: input.mimeType,
    sizeOriginal: input.sizeOriginal,
    sizeSm: smBuffer.length,
    sizeLg: lgBuffer.length,
    previewStatus: "ready",
  };
}

export async function storeImageMediaFromBuffer(input: {
  buffer: Buffer;
  ext: string;
  mimeType: string;
  uploadedAt: Date;
}): Promise<StoredMediaResult> {
  const baseName = buildMediaBaseName(input.uploadedAt);
  const ext = input.ext.toLowerCase() === "jpeg" ? "jpg" : input.ext.toLowerCase();
  if (ext === "svg") {
    const metadata = await sharp(input.buffer).metadata();
    const originalBuffer = input.buffer;
    // Keep vector data for all sizes to avoid lossy raster conversion.
    const smBuffer = input.buffer;
    const lgBuffer = input.buffer;
    await writeKey(buildStorageKey("image", baseName, ext, "original", input.uploadedAt), ext, originalBuffer);
    await writeKey(buildStorageKey("image", baseName, ext, "sm", input.uploadedAt), ext, smBuffer);
    await writeKey(buildStorageKey("image", baseName, ext, "lg", input.uploadedAt), ext, lgBuffer);
    return {
      baseName,
      ext,
      mimeType: input.mimeType,
      width: metadata.width ?? undefined,
      height: metadata.height ?? undefined,
      sizeOriginal: originalBuffer.length,
      sizeSm: smBuffer.length,
      sizeLg: lgBuffer.length,
      previewStatus: "ready",
    };
  }
  if (ext === "gif") {
    const image = sharp(input.buffer, { animated: true, pages: -1 });
    const metadata = await image.metadata();
    const width = metadata.width ?? undefined;
    const height = metadata.pageHeight ?? metadata.height ?? undefined;
    const originalBuffer = input.buffer;
    const smBuffer = await image
      .clone()
      .resize({ width: 320, withoutEnlargement: true })
      .gif()
      .toBuffer();
    const lgBuffer = await image
      .clone()
      .resize({ width: 1024, withoutEnlargement: true })
      .gif()
      .toBuffer();
    await writeKey(buildStorageKey("image", baseName, ext, "original", input.uploadedAt), ext, originalBuffer);
    await writeKey(buildStorageKey("image", baseName, ext, "sm", input.uploadedAt), ext, smBuffer);
    await writeKey(buildStorageKey("image", baseName, ext, "lg", input.uploadedAt), ext, lgBuffer);
    return {
      baseName,
      ext,
      mimeType: input.mimeType,
      width,
      height,
      sizeOriginal: originalBuffer.length,
      sizeSm: smBuffer.length,
      sizeLg: lgBuffer.length,
      previewStatus: "ready",
    };
  }
  const image = sharp(input.buffer).rotate();
  const metadata = await image.metadata();
  const format: keyof sharp.FormatEnum =
    ext === "jpg" ? "jpeg" : (ext as keyof sharp.FormatEnum);
  const originalBuffer = await image.clone().toFormat(format).toBuffer();
  const smBuffer = await image
    .clone()
    .resize({ width: 320, withoutEnlargement: true })
    .toFormat(format)
    .toBuffer();
  const lgBuffer = await image
    .clone()
    .resize({ width: 1024, withoutEnlargement: true })
    .toFormat(format)
    .toBuffer();

  await writeKey(buildStorageKey("image", baseName, ext, "original", input.uploadedAt), ext, originalBuffer);
  await writeKey(buildStorageKey("image", baseName, ext, "sm", input.uploadedAt), ext, smBuffer);
  await writeKey(buildStorageKey("image", baseName, ext, "lg", input.uploadedAt), ext, lgBuffer);

  return {
    baseName,
    ext,
    mimeType: input.mimeType,
    width: metadata.width ?? undefined,
    height: metadata.height ?? undefined,
    sizeOriginal: originalBuffer.length,
    sizeSm: smBuffer.length,
    sizeLg: lgBuffer.length,
    previewStatus: "ready",
  };
}

export async function getMediaBuffer(input: {
  kind: "image" | "video" | "document" | "other";
  baseName: string;
  ext: string;
  size: MediaSize;
  uploadedAt: Date;
}): Promise<Buffer> {
  const key = mediaStorageKey(input);
  return await readKey(key);
}

export async function getMediaBufferSize(input: {
  kind: "image" | "video" | "document" | "other";
  baseName: string;
  ext: string;
  size: MediaSize;
  uploadedAt: Date;
}): Promise<number> {
  const key = mediaStorageKey(input);
  return getKeySize(key);
}

export async function getMediaBufferRange(input: {
  kind: "image" | "video" | "document" | "other";
  baseName: string;
  ext: string;
  size: MediaSize;
  uploadedAt: Date;
  start: number;
  end: number;
}): Promise<Buffer> {
  const key = mediaStorageKey(input);
  return readKeyRange(key, input.start, input.end);
}

export async function getMediaStream(input: {
  kind: "image" | "video" | "document" | "other";
  baseName: string;
  ext: string;
  size: MediaSize;
  uploadedAt: Date;
}): Promise<ReadableStream<Uint8Array>> {
  const key = mediaStorageKey(input);
  return readKeyStream(key);
}

export async function getMediaRangeStream(input: {
  kind: "image" | "video" | "document" | "other";
  baseName: string;
  ext: string;
  size: MediaSize;
  uploadedAt: Date;
  start: number;
  end: number;
}): Promise<ReadableStream<Uint8Array>> {
  const key = mediaStorageKey(input);
  return readKeyRangeStream(key, input.start, input.end);
}

export async function getMediaSignedUrl(input: {
  kind: "image" | "video" | "document" | "other";
  baseName: string;
  ext: string;
  size: MediaSize;
  uploadedAt: Date;
  responseContentType?: string;
}): Promise<string> {
  if (!s3Client || !S3_BUCKET) {
    throw new Error("S3 is not configured.");
  }
  const key = mediaStorageKey(input);
  const presign = getSignedUrl as unknown as (
    client: unknown,
    command: unknown,
    options: { expiresIn: number },
  ) => Promise<string>;
  return presign(
    s3Client,
    new GetObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      ...(input.responseContentType ? { ResponseContentType: input.responseContentType } : {}),
    }),
    { expiresIn: mediaDirectUrlTtlSeconds() },
  );
}

export async function generateVideoPreviewFromStoredMedia(input: {
  baseName: string;
  ext: string;
  uploadedAt: Date;
}): Promise<{ sizeSm: number; sizeLg: number; width?: number; height?: number }> {
  const originalKey = buildStorageKey("video", input.baseName, input.ext, "original", input.uploadedAt);
  const source =
    STORAGE_BACKEND === "s3"
      ? await getMediaSignedUrl({
          kind: "video",
          baseName: input.baseName,
          ext: input.ext,
          size: "original",
          uploadedAt: input.uploadedAt,
          responseContentType: contentTypeForExt(input.ext),
        })
      : absolutePathForKey(originalKey);
  const videoFrame = await tryGenerateVideoPreviewFromSource(source);
  if (!videoFrame) {
    throw new Error("Unable to extract a preview frame from this video.");
  }
  const lgBuffer = await sharp(videoFrame)
    .resize({ width: 1024, withoutEnlargement: true })
    .png()
    .toBuffer();
  const smBuffer = await sharp(lgBuffer).resize({ width: 320, withoutEnlargement: true }).png().toBuffer();
  const metadata = await sharp(lgBuffer).metadata();

  const smKey = buildStorageKey("video", input.baseName, "png", "sm", input.uploadedAt);
  const lgKey = buildStorageKey("video", input.baseName, "png", "lg", input.uploadedAt);
  await writeKey(smKey, "png", smBuffer);
  await writeKey(lgKey, "png", lgBuffer);

  return {
    sizeSm: smBuffer.length,
    sizeLg: lgBuffer.length,
    width: metadata.width ?? undefined,
    height: metadata.height ?? undefined,
  };
}

export async function readCompletedUploadBuffer(storageKey: string): Promise<Buffer> {
  return readKey(storageKey);
}
