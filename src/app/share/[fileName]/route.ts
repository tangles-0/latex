import type { NextRequest } from "next/server";
import { getAlbumShareByCode, getAppSettings, getImage, getShareByCode } from "@/lib/metadata-store";
import {
  getMediaBufferSize,
  getMediaSignedUrl,
  getMediaRangeStream,
  getMediaStream,
  usesS3StorageBackend,
} from "@/lib/media-storage";
import { getSharedMediaByCode, getSharedMediaByCodeAndExt } from "@/lib/media-store";
import { contentTypeForExt } from "@/lib/media-types";
import { unavailableImageResponse } from "@/lib/unavailable-image";

export const runtime = "nodejs";

function withPublicImageCors(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  headers.set("Cross-Origin-Resource-Policy", "cross-origin");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function parseFileName(fileName: string): {
  code: string;
  size: "original" | "sm" | "lg" | "x640";
  ext: string;
} | null {
  const match = /^([A-Za-z0-9]+)(-sm|-lg|-640)?\.([a-zA-Z0-9]+)$/.exec(fileName);
  if (!match) {
    return null;
  }
  const suffix = match[2];
  const size =
    suffix === "-sm" ? "sm" : suffix === "-lg" ? "lg" : suffix === "-640" ? "x640" : "original";
  return { code: match[1], size, ext: match[3].toLowerCase() };
}

function getInternalAppOrigin(): string {
  const configured = process.env.INTERNAL_APP_ORIGIN?.trim();
  if (configured) {
    return configured;
  }
  return `http://127.0.0.1:${process.env.PORT ?? "3000"}`;
}

function publicCacheHeaders(ext: string): Headers {
  return new Headers({
    "Content-Type": contentTypeForExt(ext),
    "Cache-Control": "public, max-age=60, s-maxage=60, stale-while-revalidate=30, must-revalidate",
    Vary: "Accept-Encoding",
  });
}

function isDocumentNavigation(request: NextRequest): boolean {
  const destination = request.headers.get("sec-fetch-dest");
  const mode = request.headers.get("sec-fetch-mode");
  const accept = request.headers.get("accept") ?? "";
  return destination === "document" || mode === "navigate" || accept.includes("text/html");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function signedMediaViewerHtml(input: { src: string; mimeType: string; fileName: string }): string {
  const safeSrc = escapeHtml(input.src);
  const safeName = escapeHtml(input.fileName);
  const type = input.mimeType.toLowerCase();
  const body = type.startsWith("image/")
    ? `<img src="${safeSrc}" alt="${safeName}" style="max-width:100%;max-height:100%;object-fit:contain" />`
    : type.startsWith("video/")
      ? `<video controls autoplay style="max-width:100%;max-height:100%" src="${safeSrc}"></video>`
      : type.startsWith("audio/")
        ? `<audio controls autoplay style="width:min(720px,100%)" src="${safeSrc}"></audio>`
        : `<p><a href="${safeSrc}" rel="noopener noreferrer">Open file</a></p>`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${safeName}</title>
    <style>
      :root { color-scheme: light dark; }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: #0b0b0c;
        color: #e5e7eb;
        font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
        padding: 12px;
      }
    </style>
  </head>
  <body>
    ${body}
  </body>
</html>`;
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
  { params }: { params: Promise<{ fileName: string }> },
): Promise<Response> {
  const { fileName } = await params;
  const parsed = parseFileName(fileName);
  const allowHtmlNavigationMode = usesS3StorageBackend()
    ? (await getAppSettings()).shareHtmlNavigationEnabled
    : false;
  try {
    if (!parsed && /^[A-Za-z0-9]+$/.test(fileName)) {
      const albumShare = await getAlbumShareByCode(fileName);
      if (albumShare) {
        // Proxy internally so `/share/<code>` stays in the browser URL.
        const upstream = await fetch(new URL(`/share/internal-album/${albumShare.id}`, getInternalAppOrigin()), {
          headers: {
            accept: request.headers.get("accept") ?? "text/html,*/*",
          },
          cache: "no-store",
        });
        const headers = new Headers(upstream.headers);
        headers.delete("content-encoding");
        headers.delete("content-length");
        headers.delete("transfer-encoding");
        return new Response(upstream.body, {
          status: upstream.status,
          statusText: upstream.statusText,
          headers,
        });
      }
      return withPublicImageCors(new Response("Not found", { status: 404 }));
    }
    if (!parsed) {
      return withPublicImageCors(await unavailableImageResponse("png"));
    }

    const imageShare = await getShareByCode(parsed.code);
    if (imageShare) {
      const image = await getImage(imageShare.imageId);
      if (image && image.ext === parsed.ext) {
        const imageRequestedSize =
          image.ext.toLowerCase() === "svg" && parsed.size !== "original"
            ? "original"
            : parsed.size === "x640"
              ? "lg"
              : parsed.size;
        if (usesS3StorageBackend()) {
          const responseExt = imageRequestedSize === "original" ? image.ext : "png";
          const mimeType = contentTypeForExt(responseExt);
          const signedUrl = await getMediaSignedUrl({
            kind: "image",
            baseName: image.baseName,
            ext: image.ext,
            size: imageRequestedSize,
            uploadedAt: new Date(image.uploadedAt),
            responseContentType: mimeType,
          });
          if (allowHtmlNavigationMode && isDocumentNavigation(request)) {
            const html = signedMediaViewerHtml({
              src: signedUrl,
              mimeType,
              fileName,
            });
            return withPublicImageCors(
              new Response(html, {
                headers: {
                  "Content-Type": "text/html; charset=utf-8",
                  "Cache-Control": "no-store",
                },
              }),
            );
          }
          return withPublicImageCors(Response.redirect(signedUrl, 307));
        }
        const stream = await getMediaStream({
          kind: "image",
          baseName: image.baseName,
          ext: image.ext,
          size: imageRequestedSize,
          uploadedAt: new Date(image.uploadedAt),
        });
        return withPublicImageCors(new Response(stream, { headers: publicCacheHeaders(image.ext) }));
      }
    }

    let media = await getSharedMediaByCodeAndExt(parsed.code, parsed.ext);
    if (!media && parsed.size !== "original" && parsed.ext === "png") {
      media = await getSharedMediaByCode(parsed.code);
    }
    if (!media) {
      return withPublicImageCors(await unavailableImageResponse(parsed.ext));
    }
    if (media.kind === "video" && media.previewStatus !== "ready" && parsed.size !== "original") {
      return withPublicImageCors(new Response("Not found", { status: 404 }));
    }
    const requestedSize =
      media.kind === "image" && media.ext.toLowerCase() === "svg" && parsed.size !== "original"
        ? "original"
        : parsed.size === "x640"
          ? "lg"
          : parsed.size;
    const isRangeStreamableOriginal =
      requestedSize === "original" &&
      (media.kind === "video" ||
        (media.kind === "other" && (media.mimeType ?? "").toLowerCase().startsWith("audio/")));
    if (usesS3StorageBackend()) {
      const responseExt =
        requestedSize === "original" ? media.ext : media.kind === "image" ? media.ext : "png";
      const mimeType = contentTypeForExt(responseExt);
      const signedUrl = await getMediaSignedUrl({
        kind: media.kind,
        baseName: media.baseName,
        ext: media.ext,
        size: requestedSize,
        uploadedAt: new Date(media.uploadedAt),
        responseContentType: mimeType,
      });
      if (allowHtmlNavigationMode && isDocumentNavigation(request)) {
        const html = signedMediaViewerHtml({
          src: signedUrl,
          mimeType,
          fileName,
        });
        return withPublicImageCors(
          new Response(html, {
            headers: {
              "Content-Type": "text/html; charset=utf-8",
              "Cache-Control": "no-store",
            },
          }),
        );
      }
      return withPublicImageCors(Response.redirect(signedUrl, 307));
    }
    if (isRangeStreamableOriginal) {
      const uploadedAt = new Date(media.uploadedAt);
      const total = await getMediaBufferSize({
        kind: media.kind,
        baseName: media.baseName,
        ext: media.ext,
        size: "original",
        uploadedAt,
      });
      const rangeHeader = request.headers.get("range");
      if (rangeHeader) {
        const byteRange = parseByteRange(rangeHeader, total);
        if (!byteRange) {
          return withPublicImageCors(
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
          size: "original",
          uploadedAt,
          start: byteRange.start,
          end: byteRange.end,
        });
        const headers = publicCacheHeaders(media.ext);
        headers.set("Content-Range", `bytes ${byteRange.start}-${byteRange.end}/${total}`);
        headers.set("Content-Length", String(byteRange.end - byteRange.start + 1));
        headers.set("Accept-Ranges", "bytes");
        return withPublicImageCors(new Response(stream, { status: 206, headers }));
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
    return withPublicImageCors(new Response(stream, { headers }));
  } catch {
    if (!parsed) {
      return withPublicImageCors(new Response("Service temporarily unavailable.", { status: 503 }));
    }
    return withPublicImageCors(await unavailableImageResponse(parsed.ext));
  }
}

