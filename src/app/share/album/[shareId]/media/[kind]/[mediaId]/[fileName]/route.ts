import type { NextRequest } from "next/server";
import { getAlbumShareById } from "@/lib/metadata-store";
import { getMedia, type MediaKind } from "@/lib/media-store";
import { contentTypeForExt } from "@/lib/media-types";
import {
  getMediaBufferSize,
  getMediaSignedUrl,
  getMediaRangeStream,
  getMediaStream,
  usesS3StorageBackend,
} from "@/lib/media-storage";
import { unavailableImageResponse } from "@/lib/unavailable-image";

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

function withPublicCors(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, Range");
  headers.set("Cross-Origin-Resource-Policy", "cross-origin");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function publicCacheHeaders(ext: string): Headers {
  return new Headers({
    "Content-Type": contentTypeForExt(ext),
    "Cache-Control": "public, max-age=60, s-maxage=60, stale-while-revalidate=30, must-revalidate",
    Vary: "Accept-Encoding",
  });
}

export async function GET(
  request: NextRequest,
  {
    params,
  }: { params: Promise<{ shareId: string; kind: string; mediaId: string; fileName: string }> },
): Promise<Response> {
  const { shareId, kind, mediaId, fileName } = await params;
  const parsedKind = parseKind(kind);
  const parsed = parseFileName(fileName);
  if (!parsedKind || !parsed) {
    return withPublicCors(await unavailableImageResponse("png"));
  }

  try {
    const share = await getAlbumShareById(shareId);
    if (!share) {
      return withPublicCors(await unavailableImageResponse(parsed.ext));
    }

    const media = await getMedia(parsedKind, mediaId);
    if (!media || media.albumId !== share.albumId || media.baseName !== parsed.baseName) {
      return withPublicCors(await unavailableImageResponse(parsed.ext));
    }

    if (media.kind === "video" && media.previewStatus !== "ready" && parsed.size !== "original") {
      return withPublicCors(new Response("Not found", { status: 404 }));
    }

    const requestedSize =
      media.kind === "image" && media.ext.toLowerCase() === "svg" && parsed.size !== "original"
        ? "original"
        : parsed.size;

    const isRangeStreamableOriginal =
      requestedSize === "original" &&
      (media.kind === "video" ||
        (media.kind === "other" && (media.mimeType ?? "").toLowerCase().startsWith("audio/")));
    if (usesS3StorageBackend()) {
      const responseExt =
        requestedSize === "original" ? media.ext : media.kind === "image" ? media.ext : "png";
      const signedUrl = await getMediaSignedUrl({
        kind: media.kind,
        baseName: media.baseName,
        ext: media.ext,
        size: requestedSize,
        uploadedAt: new Date(media.uploadedAt),
        responseContentType: contentTypeForExt(responseExt),
      });
      return withPublicCors(Response.redirect(signedUrl, 307));
    }

    if (isRangeStreamableOriginal) {
      const uploadedAt = new Date(media.uploadedAt);
      const total = await getMediaBufferSize({
        kind: media.kind,
        baseName: media.baseName,
        ext: media.ext,
        size: requestedSize,
        uploadedAt,
      });
      const rangeHeader = request.headers.get("range");
      if (rangeHeader) {
        const byteRange = parseByteRange(rangeHeader, total);
        if (!byteRange) {
          return withPublicCors(
            new Response("Requested Range Not Satisfiable", {
              status: 416,
              headers: {
                "Content-Range": `bytes */${total}`,
                "Accept-Ranges": "bytes",
              },
            }),
          );
        }
        const stream = await getMediaRangeStream({
          kind: media.kind,
          baseName: media.baseName,
          ext: media.ext,
          size: requestedSize,
          uploadedAt,
          start: byteRange.start,
          end: byteRange.end,
        });
        const headers = publicCacheHeaders(media.ext);
        headers.set("Content-Range", `bytes ${byteRange.start}-${byteRange.end}/${total}`);
        headers.set("Content-Length", String(byteRange.end - byteRange.start + 1));
        headers.set("Accept-Ranges", "bytes");
        return withPublicCors(new Response(stream, { status: 206, headers }));
      }
    }

    const stream = await getMediaStream({
      kind: media.kind,
      baseName: media.baseName,
      ext: media.ext,
      size: requestedSize,
      uploadedAt: new Date(media.uploadedAt),
    });
    const responseExt =
      requestedSize === "original" ? media.ext : media.kind === "image" ? media.ext : "png";
    const headers = publicCacheHeaders(responseExt);
    if (isRangeStreamableOriginal) {
      headers.set("Accept-Ranges", "bytes");
    }
    return withPublicCors(new Response(stream, { headers }));
  } catch {
    return withPublicCors(await unavailableImageResponse(parsed.ext));
  }
}
