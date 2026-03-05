"use client";

import { FileViewerContent } from "@/components/viewers/file-viewer-content";

type AlbumMedia = {
  id: string;
  kind: "image" | "video" | "document" | "other";
  baseName: string;
  originalFileName?: string;
  ext: string;
  mimeType: string;
  width?: number;
  height?: number;
  previewStatus?: "pending" | "ready" | "failed";
  albumCaption?: string;
  uploadedAt: string;
};

export default function AlbumShareView({
  shareId,
  albumName,
  media,
}: {
  shareId: string;
  albumName: string;
  media: AlbumMedia[];
}) {
  const formatTimestamp = (value: string) =>
    `${new Date(value).toISOString().replace("T", " ").slice(0, 19)} UTC`;

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-2 sm:gap-6 px-2 sm:px-6 py-2 sm:py-10 text-sm">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">{albumName}</h1>
        <p className="text-neutral-600">
          {media.length} file{media.length === 1 ? "" : "s"}
        </p>
      </header>

      <div className="space-y-6">
        {media.map((item) => {
          const previewExt = item.kind === "image" ? item.ext : "png";
          const fullUrl = `/share/album/${shareId}/media/${item.kind}/${item.id}/${item.baseName}.${item.ext}`;
          const previewUrl = `/share/album/${shareId}/media/${item.kind}/${item.id}/${item.baseName}-lg.${previewExt}`;
          return (
            <div key={item.id} className="rounded-md border border-neutral-200 p-4">
              {item.kind === "image" ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={previewUrl}
                  alt="Shared album file"
                  className="w-full rounded border border-neutral-200 object-contain"
                />
              ) : (
                <FileViewerContent
                  kind={item.kind}
                  previewStatus={item.previewStatus}
                  fullUrl={fullUrl}
                  previewUrl={previewUrl}
                  ext={item.ext}
                  mimeType={item.mimeType}
                />
              )}
              <div className="mt-3 text-xs text-neutral-500">
                {item.width && item.height ? `${item.width}×${item.height} • ` : ""}
                {formatTimestamp(item.uploadedAt)}
              </div>
              <div className="mt-1 text-xs text-neutral-700">{item.originalFileName || item.baseName}</div>
              {item.albumCaption ? (
                <p className="mt-2 text-xs text-neutral-700">{item.albumCaption}</p>
              ) : null}
            </div>
          );
        })}
      </div>
    </main>
  );
}

