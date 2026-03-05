import type { NextRequest } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { getMediaForUser, type MediaKind } from "@/lib/media-store";
import { contentTypeForExt } from "@/lib/media-types";
import {
  getMediaBufferSize,
  getMediaSignedUrl,
  getMediaRangeStream,
  getMediaStream,
  usesS3StorageBackend,
} from "@/lib/media-storage";

export const runtime = "nodejs";

function parseKind(kind: string): MediaKind | null {
  if (kind === "image" || kind === "video" || kind === "document" || kind === "other") {
    return kind;
  }
  return null;
}

function parseFileName(fileName: string): { baseName: string; size: "original" | "sm" | "lg"; ext: string } | null {
  const match = /^(.*?)(-sm|-lg)?\.([a-zA-Z0-9]+)$/.exec(fileName);
  if (!match) {
    return null;
  }
  const suffix = match[2];
  const size = suffix === "-sm" ? "sm" : suffix === "-lg" ? "lg" : "original";
  return { baseName: match[1], size, ext: match[3].toLowerCase() };
}

function parseByteRange(rangeHeader: string, total: number): { start: number; end: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim());
  if (!match) {
    return null;
  }
  const startRaw = match[1];
  const endRaw = match[2];
  if (!startRaw && !endRaw) {
    return null;
  }
  if (!startRaw && endRaw) {
    const suffixLength = Number(endRaw);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) {
      return null;
    }
    const length = Math.min(total, suffixLength);
    return { start: total - length, end: total - 1 };
  }
  const start = Number(startRaw);
  let end = endRaw ? Number(endRaw) : total - 1;
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || start >= total) {
    return null;
  }
  end = Math.min(end, total - 1);
  return { start, end };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ kind: string; mediaId: string; fileName: string }> },
): Promise<Response> {
  const { kind, mediaId, fileName } = await params;
  const parsedKind = parseKind(kind);
  const parsed = parseFileName(fileName);
  if (!parsedKind || !parsed) {
    return new Response("Not found", { status: 404 });
  }

  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) {
    return new Response("Unauthorized", { status: 401 });
  }

  const media = await getMediaForUser(parsedKind, mediaId, userId);
  if (!media) {
    return new Response("Not found", { status: 404 });
  }
  if (parsed.baseName !== media.baseName) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const requestedSize =
      parsedKind === "image" && media.ext.toLowerCase() === "svg" && parsed.size !== "original"
        ? "original"
        : parsed.size;
    if (parsedKind === "video" && parsed.size !== "original" && media.previewStatus !== "ready") {
      return new Response("Not found", { status: 404 });
    }
    const isRangeStreamableOriginal =
      requestedSize === "original" &&
      (parsedKind === "video" ||
        (parsedKind === "other" && (media.mimeType ?? "").toLowerCase().startsWith("audio/")));
    if (usesS3StorageBackend()) {
      const responseExt =
        requestedSize === "original" ? media.ext : parsedKind === "image" ? media.ext : "png";
      const signedUrl = await getMediaSignedUrl({
        kind: parsedKind,
        baseName: media.baseName,
        ext: media.ext,
        size: requestedSize,
        uploadedAt: new Date(media.uploadedAt),
        responseContentType: contentTypeForExt(responseExt),
      });
      return Response.redirect(signedUrl, 307);
    }
    if (isRangeStreamableOriginal) {
      const uploadedAt = new Date(media.uploadedAt);
      const total = await getMediaBufferSize({
        kind: parsedKind,
        baseName: media.baseName,
        ext: media.ext,
        size: requestedSize,
        uploadedAt,
      });
      const rangeHeader = request.headers.get("range");
      if (rangeHeader) {
        const byteRange = parseByteRange(rangeHeader, total);
        if (!byteRange) {
          return new Response("Requested Range Not Satisfiable", {
            status: 416,
            headers: {
              "Content-Range": `bytes */${total}`,
              "Accept-Ranges": "bytes",
            },
          });
        }
        const stream = await getMediaRangeStream({
          kind: parsedKind,
          baseName: media.baseName,
          ext: media.ext,
          size: requestedSize,
          uploadedAt,
          start: byteRange.start,
          end: byteRange.end,
        });
        return new Response(stream, {
          status: 206,
          headers: {
            "Content-Type": contentTypeForExt(media.ext),
            "Content-Range": `bytes ${byteRange.start}-${byteRange.end}/${total}`,
            "Content-Length": String(byteRange.end - byteRange.start + 1),
            "Accept-Ranges": "bytes",
            "Cache-Control": "private, no-store, max-age=0, must-revalidate",
            Pragma: "no-cache",
            Expires: "0",
            Vary: "Cookie, Authorization",
          },
        });
      }
    }
    const stream = await getMediaStream({
      kind: parsedKind,
      baseName: media.baseName,
      ext: media.ext,
      size: requestedSize,
      uploadedAt: new Date(media.uploadedAt),
    });
    const responseExt =
      requestedSize === "original" ? media.ext : parsedKind === "image" ? media.ext : "png";
    return new Response(stream, {
      headers: {
        "Content-Type": contentTypeForExt(responseExt),
        ...(isRangeStreamableOriginal ? { "Accept-Ranges": "bytes" } : {}),
        "Cache-Control": "private, no-store, max-age=0, must-revalidate",
        Pragma: "no-cache",
        Expires: "0",
        Vary: "Cookie, Authorization",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}

