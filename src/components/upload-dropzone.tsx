"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  DEFAULT_RESUMABLE_THRESHOLD,
  KEEP_ORIGINAL_FILE_NAME_STORAGE_KEY,
  uploadSingleMedia,
} from "@/lib/upload-client";
import { LightClock } from "@energiz3r/icon-library/Icons/Light/LightClock";
import { getFileIconForExtension } from "@/lib/FileIconHelper";

type UploadState = "idle" | "uploading" | "success" | "error";

type UploadedImage = {
  id: string;
  kind: "image" | "video" | "document" | "other";
  baseName: string;
  originalFileName?: string;
  ext: string;
  mimeType?: string;
  previewStatus?: "pending" | "ready" | "failed";
};

type ShareInfo = {
  id: string;
  urls: {
    original: string;
  };
};

type UploadMessage = {
  id: string;
  text: string;
  tone: "success" | "error";
};

export default function UploadDropzone({
  uploadsEnabled = true,
  resumableThresholdBytes = DEFAULT_RESUMABLE_THRESHOLD,
}: {
  uploadsEnabled?: boolean;
  resumableThresholdBytes?: number;
}) {
  const [albumId, setAlbumId] = useState("");
  const [status, setStatus] = useState<UploadState>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [globalDragging, setGlobalDragging] = useState(false);
  const [albums, setAlbums] = useState<{ id: string; name: string }[]>([]);
  const [isAlbumModalOpen, setIsAlbumModalOpen] = useState(false);
  const [newAlbumName, setNewAlbumName] = useState("");
  const [albumError, setAlbumError] = useState<string | null>(null);
  const [recentUploads, setRecentUploads] = useState<UploadedImage[]>([]);
  const [shareStates, setShareStates] = useState<Record<string, ShareInfo>>({});
  const [copied, setCopied] = useState<string | null>(null);
  const [messages, setMessages] = useState<UploadMessage[]>([]);
  const [uploadProgress, setUploadProgress] = useState<
    Record<string, { name: string; uploaded: number; total: number; resumed: boolean }>
  >({});
  const [incompleteSessions, setIncompleteSessions] = useState<
    Array<{
      id: string;
      fileName: string;
      fileSize: number;
      state: string;
      uploadedPartsCount: number;
      totalParts: number;
      checksum?: string;
      updatedAt: string;
    }>
  >([]);
  const [isClearingFailed, setIsClearingFailed] = useState(false);
  const [keepOriginalFileName, setKeepOriginalFileName] = useState(false);
  const [hasLoadedKeepOriginalFileName, setHasLoadedKeepOriginalFileName] = useState(false);
  const dragCounter = useRef(0);
  const uploadFilesRef = useRef<(files: FileList | File[]) => Promise<void>>(async () => {});
  const inputId = useId();

  const statusText = useMemo(() => {
    if (status === "uploading") return "uploading...";
    if (status === "success") return "upload complete.";
    if (status === "error") return message ?? "oh shi-";
    return "drag N drop files here, or click 2 browse";
  }, [message, status]);

  function pushMessage(text: string, tone: UploadMessage["tone"]) {
    const entry: UploadMessage = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      text,
      tone,
    };
    setMessages((current) => [entry, ...current]);
    window.setTimeout(() => {
      setMessages((current) => current.filter((item) => item.id !== entry.id));
    }, 4000);
  }

  function formatBytes(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes <= 0) return "0 MB";
    const gb = 1024 * 1024 * 1024;
    const mb = 1024 * 1024;
    if (bytes >= gb) {
      return `${(bytes / gb).toFixed(2)} GB`;
    }
    return `${(bytes / mb).toFixed(1)} MB`;
  }

  async function hashFileForResume(file: File): Promise<string> {
    const firstSlice = await file.slice(0, Math.min(file.size, 1024 * 1024)).arrayBuffer();
    const lastSliceStart = Math.max(0, file.size - 1024 * 1024);
    const lastSlice = await file.slice(lastSliceStart, file.size).arrayBuffer();
    const encoder = new TextEncoder();
    const meta = encoder.encode(`${file.name}|${file.size}|${file.lastModified}|${file.type}`);
    const combined = new Uint8Array(meta.length + firstSlice.byteLength + lastSlice.byteLength);
    combined.set(meta, 0);
    combined.set(new Uint8Array(firstSlice), meta.length);
    combined.set(new Uint8Array(lastSlice), meta.length + firstSlice.byteLength);
    const digest = await crypto.subtle.digest("SHA-256", combined.buffer);
    return Array.from(new Uint8Array(digest))
      .map((item) => item.toString(16).padStart(2, "0"))
      .join("");
  }

  async function loadIncompleteSessions() {
    const response = await fetch("/api/uploads/list", { cache: "no-store" });
    if (!response.ok) {
      return;
    }
    const payload = (await response.json()) as {
      sessions?: Array<{
        id: string;
        fileName: string;
        fileSize: number;
        state: string;
        uploadedPartsCount: number;
        totalParts: number;
        checksum?: string;
        updatedAt: string;
      }>;
    };
    setIncompleteSessions(payload.sessions ?? []);
  }

  async function clearFailedSessions() {
    const failedIds = incompleteSessions
      .filter((session) => session.state === "failed")
      .map((session) => session.id);
    if (failedIds.length === 0) {
      return;
    }
    setIsClearingFailed(true);
    const response = await fetch("/api/uploads/clear-failed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionIds: failedIds }),
    });
    if (!response.ok) {
      pushMessage("Unable to clear failed uploads.", "error");
      setIsClearingFailed(false);
      return;
    }
    setIncompleteSessions((current) => current.filter((session) => session.state !== "failed"));
    pushMessage("Cleared failed uploads.", "success");
    setIsClearingFailed(false);
  }

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(KEEP_ORIGINAL_FILE_NAME_STORAGE_KEY);
      setKeepOriginalFileName(stored === "1");
    } catch {
      // ignore storage errors
    } finally {
      setHasLoadedKeepOriginalFileName(true);
    }
  }, []);

  useEffect(() => {
    if (!hasLoadedKeepOriginalFileName) {
      return;
    }
    try {
      window.localStorage.setItem(KEEP_ORIGINAL_FILE_NAME_STORAGE_KEY, keepOriginalFileName ? "1" : "0");
    } catch {
      // ignore storage errors
    }
  }, [hasLoadedKeepOriginalFileName, keepOriginalFileName]);

  useEffect(() => {
    let isMounted = true;
    async function loadAlbumsAndSessions() {
      const [albumsResponse, sessionsResponse] = await Promise.all([
        fetch("/api/albums"),
        fetch("/api/uploads/list", { cache: "no-store" }),
      ]);
      if (albumsResponse.ok) {
        const payload = (await albumsResponse.json()) as { albums?: { id: string; name: string }[] };
        if (isMounted && payload.albums) {
          setAlbums(payload.albums);
        }
      }
      if (sessionsResponse.ok) {
        const payload = (await sessionsResponse.json()) as {
          sessions?: Array<{
            id: string;
            fileName: string;
            fileSize: number;
            state: string;
            uploadedPartsCount: number;
            totalParts: number;
            checksum?: string;
            updatedAt: string;
          }>;
        };
        if (isMounted) {
          setIncompleteSessions(payload.sessions ?? []);
        }
      }
    }

    void loadAlbumsAndSessions();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    function handleDragEnter(event: DragEvent) {
      if (!uploadsEnabled) return;
      event.preventDefault();
      dragCounter.current += 1;
      setGlobalDragging(true);
    }

    function handleDragOver(event: DragEvent) {
      if (!uploadsEnabled) return;
      event.preventDefault();
    }

    function handleDragLeave(event: DragEvent) {
      if (!uploadsEnabled) return;
      event.preventDefault();
      dragCounter.current -= 1;
      if (dragCounter.current <= 0) {
        setGlobalDragging(false);
      }
    }

    function handleDrop(event: DragEvent) {
      if (!uploadsEnabled) return;
      event.preventDefault();
      dragCounter.current = 0;
      setGlobalDragging(false);
      const files = event.dataTransfer?.files;
      if (files && files.length > 0) {
        void uploadFilesRef.current(files);
      }
    }

    window.addEventListener("dragenter", handleDragEnter);
    window.addEventListener("dragover", handleDragOver);
    window.addEventListener("dragleave", handleDragLeave);
    window.addEventListener("drop", handleDrop);
    return () => {
      window.removeEventListener("dragenter", handleDragEnter);
      window.removeEventListener("dragover", handleDragOver);
      window.removeEventListener("dragleave", handleDragLeave);
      window.removeEventListener("drop", handleDrop);
    };
  }, [uploadsEnabled]);

  useEffect(() => {
    const pending = recentUploads.filter(
      (item) => item.kind === "video" && item.previewStatus === "pending",
    );
    if (pending.length === 0) {
      return;
    }
    let isMounted = true;
    const interval = window.setInterval(() => {
      const targets = pending.slice(0, 10);
      void Promise.all(
        targets.map(async (item) => {
          const response = await fetch(
            `/api/media/preview-status?kind=video&mediaId=${encodeURIComponent(item.id)}`,
            { cache: "no-store" },
          );
          if (!response.ok) {
            return;
          }
          const payload = (await response.json()) as { previewStatus?: "pending" | "ready" | "failed" };
          if (!payload.previewStatus || !isMounted) {
            return;
          }
          setRecentUploads((current) =>
            {
              let changed = false;
              const next = current.map((entry) => {
                if (entry.id === item.id && entry.previewStatus !== payload.previewStatus) {
                  changed = true;
                  return { ...entry, previewStatus: payload.previewStatus };
                }
                return entry;
              });
              return changed ? next : current;
            },
          );
        }),
      );
    }, 5000);
    return () => {
      isMounted = false;
      window.clearInterval(interval);
    };
  }, [recentUploads]);

  async function uploadFiles(files: FileList | File[]) {
    if (!uploadsEnabled) {
      setStatus("error");
      setMessage("Uploads are currently disabled.");
      return;
    }
    const items = Array.from(files);
    if (items.length === 0) {
      setStatus("error");
      setMessage("Please drop files.");
      return;
    }

    setStatus("uploading");
    setMessage(null);

    for (const file of items) {
      const fileKey = `${file.name}::${file.size}::${file.lastModified}`;
      let checksum: string | undefined;
      try {
        checksum = await hashFileForResume(file);
      } catch {
        checksum = undefined;
      }
      const resumeCandidate = checksum
        ? incompleteSessions.find(
            (session) =>
              session.checksum === checksum &&
              session.fileSize === file.size &&
              session.fileName === file.name &&
              session.state !== "complete",
          )
        : undefined;
      const fallbackResumeCandidate =
        !resumeCandidate
          ? incompleteSessions.find(
              (session) =>
                session.fileSize === file.size &&
                session.fileName === file.name &&
                session.state !== "complete",
            )
          : undefined;
      const selectedResumeCandidate = resumeCandidate ?? fallbackResumeCandidate;
      const isResumed = Boolean(selectedResumeCandidate?.id);
      if (selectedResumeCandidate?.id) {
        setIncompleteSessions((current) =>
          current.filter((session) => session.id !== selectedResumeCandidate.id),
        );
      }
      setUploadProgress((current) => ({
        ...current,
        [fileKey]: {
          name: file.name,
          uploaded: 0,
          total: file.size,
          resumed: isResumed,
        },
      }));
      const result = await uploadSingleMedia(file, albumId.trim() || undefined, {
        resumableThresholdBytes,
        resumeFromSessionId: selectedResumeCandidate?.id,
        checksum,
        keepOriginalFileName,
        onProgress: (uploaded, total) => {
          setUploadProgress((current) => ({
            ...current,
            [fileKey]: {
              name: file.name,
              uploaded,
              total,
              resumed: isResumed,
            },
          }));
        },
      });
      pushMessage(result.message, result.ok ? "success" : "error");

      if (!result.ok) {
        setStatus("error");
        setMessage(result.message);
        setUploadProgress((current) => {
          const next = { ...current };
          delete next[fileKey];
          return next;
        });
        await loadIncompleteSessions();
        continue;
      }

      const image = result.media;
      if (!image) {
        continue;
      }
      setRecentUploads((current) => {
        const next = [
          {
            id: image.id,
            kind: image.kind,
            baseName: image.baseName,
            originalFileName:
              image.originalFileName ?? (keepOriginalFileName ? file.name : undefined),
            ext: image.ext,
            mimeType: image.mimeType,
            previewStatus: image.previewStatus,
          },
          ...current,
        ];
        return next.slice(0, 10);
      });
      setUploadProgress((current) => {
        const next = { ...current };
        delete next[fileKey];
        return next;
      });
      // Session row already removed when resume started.
    }

    setStatus("success");
    setMessage(null);
    await loadIncompleteSessions();
  }

  useEffect(() => {
    uploadFilesRef.current = uploadFiles;
  });

  async function handleCreateAlbum() {
    const name = newAlbumName.trim();
    if (!name) {
      setAlbumError("Album name is required.");
      return;
    }

    setAlbumError(null);
    const response = await fetch("/api/albums", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });

    if (!response.ok) {
      const payload = (await response.json()) as { error?: string };
      setAlbumError(payload.error ?? "Unable to create album.");
      return;
    }

    const payload = (await response.json()) as { album: { id: string; name: string } };
    setAlbums((current) => [payload.album, ...current]);
    setAlbumId(payload.album.id);
    setNewAlbumName("");
    setIsAlbumModalOpen(false);
  }

  async function enableSharing(image: UploadedImage): Promise<ShareInfo | null> {
    const response = await fetch("/api/media-shares", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: image.kind, mediaId: image.id }),
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as { share: { id: string }; urls: { original: string } };
    const nextShare = { id: payload.share.id, urls: { original: payload.urls.original } };
    setShareStates((current) => ({
      ...current,
      [image.id]: nextShare,
    }));
    return nextShare;
  }

  async function copyShare(image: UploadedImage) {
    let share: ShareInfo | null | undefined = shareStates[image.id];
    if (!share) {
      share = await enableSharing(image);
    }
    if (!share) {
      return;
    }
    await navigator.clipboard.writeText(`${window.location.origin}${share.urls.original}`);
    setCopied(image.id);
    window.setTimeout(
      () => setCopied((current) => (current === image.id ? null : current)),
      1200,
    );
  }

  async function deleteRecentUpload(image: UploadedImage) {
    const response = await fetch("/api/media/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", mediaItems: [{ id: image.id, kind: image.kind }] }),
    });

    if (!response.ok) {
      const payload = (await response.json()) as { error?: string };
      pushMessage(payload.error ?? "Unable to delete image.", "error");
      return;
    }

    setRecentUploads((current) => current.filter((item) => item.id !== image.id));
    setShareStates((current) => {
      if (!(image.id in current)) {
        return current;
      }
      const next = { ...current };
      delete next[image.id];
      return next;
    });
    pushMessage("img deleted.", "success");
  }

  function onDragOver(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(true);
  }

  function onDragLeave() {
    setIsDragging(false);
  }

  function onDropVisual(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
  }

  return (
    <section className="space-y-3 rounded-md border border-neutral-200 p-4">
      <h2 className="text-lg font-medium">upload files</h2>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="block text-xs text-neutral-500" htmlFor={inputId}>
          album (optional)
        </label>
        <button
          type="button"
          onClick={() => {
            setAlbumError(null);
            setIsAlbumModalOpen(true);
          }}
          className="rounded border border-neutral-200 px-3 py-1 text-xs"
        >
          + album
        </button>
      </div>
      <select
        id={inputId}
        name="albumId"
        value={albumId}
        onChange={(event) => setAlbumId(event.target.value)}
        className="w-full rounded border px-3 py-2"
      >
        <option value="">no album</option>
        {albums.map((album) => (
          <option key={album.id} value={album.id}>
            {album.name}
          </option>
        ))}
      </select>
      <label className="flex items-center gap-2 text-xs text-neutral-600">
        <input
          type="checkbox"
          checked={keepOriginalFileName}
          onChange={(event) => setKeepOriginalFileName(event.target.checked)}
        />
        keep original file name
      </label>

      <div
        role="button"
        tabIndex={0}
        onDragOver={uploadsEnabled ? onDragOver : undefined}
        onDragLeave={uploadsEnabled ? onDragLeave : undefined}
        onDrop={uploadsEnabled ? onDropVisual : undefined}
        onClick={
          uploadsEnabled ? () => document.getElementById(`${inputId}-file`)?.click() : undefined
        }
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            if (uploadsEnabled) {
              document.getElementById(`${inputId}-file`)?.click();
            }
          }
        }}
        className={`flex min-h-[180px] flex-col items-center justify-center rounded border border-dashed px-6 py-8 text-center text-sm transition ${
          uploadsEnabled ? "cursor-pointer" : "cursor-not-allowed opacity-60"
        } ${isDragging || globalDragging ? "border-black bg-neutral-50" : "border-neutral-300"}`}
      >
        <p className="font-medium">{statusText}</p>
        <p className="mt-2 text-xs text-neutral-500">
          files are stored by upload time with metadata removed.
        </p>
      </div>

      <input
        id={`${inputId}-file`}
        type="file"
        accept="*/*"
        multiple
        className="hidden"
        disabled={!uploadsEnabled}
        onChange={(event) => {
          if (event.target.files?.length) {
            void uploadFiles(event.target.files);
          }
        }}
      />

      {globalDragging ? (
        <div className="pointer-events-none fixed inset-0 z-40 bg-black/30" />
      ) : null}

      {messages.length > 0 ? (
        <div className="fixed top-4 left-1/2 z-50 w-full max-w-md -translate-x-1/2 space-y-2 px-4">
          {messages.map((item) => (
            <div
              key={item.id}
              className={`rounded border px-3 py-2 text-xs shadow ${
                item.tone === "success"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-red-200 bg-red-50 text-red-700"
              }`}
            >
              {item.text}
            </div>
          ))}
        </div>
      ) : null}

      {recentUploads.length > 0 ? (
        <div className="space-y-2">
          <h3 className="text-xs font-medium text-neutral-600">ur recent uploads</h3>
          <div className="space-y-2">
            {recentUploads.map((image) => {
              const thumbUrl =
                image.kind === "image"
                  ? `/media/${image.kind}/${image.id}/${image.baseName}-sm.${image.ext}`
                  : `/media/${image.kind}/${image.id}/${image.baseName}-sm.png`;
              return (
                <div
                  key={image.id}
                  className="flex items-center justify-between gap-3 rounded border border-neutral-200 px-3 py-2 text-xs"
                >
                  <div className="flex items-center gap-3">
                    {image.kind === "video" && image.previewStatus !== "ready" ? (
                      <div className="flex h-8 w-8 items-center justify-center rounded border border-dashed border-neutral-300 bg-neutral-50 text-neutral-500">
                        <LightClock className="h-4 w-4" fill="currentColor" />
                      </div>
                    ) : image.kind === "document" && image.previewStatus !== "ready" ? (
                      <div className="flex h-8 w-8 items-center justify-center rounded border border-dashed border-neutral-300 bg-neutral-50 text-neutral-500">
                        {(() => {
                          const Icon = getFileIconForExtension(image.ext);
                          return <Icon className="h-4 w-4" fill="currentColor" />;
                        })()}
                      </div>
                    ) : image.kind === "other" ? (
                      <div className="flex h-8 w-8 items-center justify-center rounded border border-dashed border-neutral-300 bg-neutral-50 text-neutral-500">
                        {(() => {
                          const Icon = getFileIconForExtension(image.ext);
                          return <Icon className="h-4 w-4" fill="currentColor" />;
                        })()}
                      </div>
                    ) : (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={thumbUrl}
                        alt="Uploaded thumbnail"
                        className="h-8 w-8 rounded object-cover"
                      />
                    )}
                    <span className="max-w-[160px] truncate">{image.originalFileName || image.baseName}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void copyShare(image)}
                      className="rounded border border-neutral-200 px-2 py-1 text-[11px]"
                    >
                      {copied === image.id ? "Copied" : "Copy link"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void deleteRecentUpload(image)}
                      className="rounded border border-neutral-200 p-1 text-neutral-500"
                      aria-label="Delete image"
                      title="Delete image"
                    >
                      <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
                        <path
                          d="M9 3h6l1 2h4v2H4V5h4l1-2Zm1 6h2v9h-2V9Zm4 0h2v9h-2V9ZM7 9h2v9H7V9Zm-1 11h12a2 2 0 0 0 2-2V7H4v11a2 2 0 0 0 2 2Z"
                          fill="currentColor"
                        />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {Object.keys(uploadProgress).length > 0 ? (
        <div className="space-y-2 rounded border border-neutral-200 p-3">
          <h3 className="text-xs font-medium text-neutral-600">upload progress</h3>
          <div className="space-y-1">
            {Object.entries(uploadProgress).map(([key, progress]) => (
              <div key={key} className="text-xs text-neutral-600">
                {progress.resumed ? `Resumed: ${progress.name}` : progress.name}:{" "}
                {formatBytes(progress.uploaded)} / {formatBytes(progress.total)}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {incompleteSessions.length > 0 ? (
        <div className="space-y-2 rounded border border-neutral-200 p-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-medium text-neutral-600">failed / interrupted uploads</h3>
            <button
              type="button"
              onClick={() => void clearFailedSessions()}
              disabled={isClearingFailed || !incompleteSessions.some((session) => session.state === "failed")}
              className="rounded border border-neutral-200 px-2 py-1 text-[11px] disabled:opacity-50"
            >
              {isClearingFailed ? "Clearing..." : "Clear"}
            </button>
          </div>
          <div className="space-y-1">
            {incompleteSessions.slice(0, 20).map((session) => (
              <div key={session.id} className="text-xs text-neutral-600">
                {session.fileName} - {session.state} ({session.uploadedPartsCount}/{session.totalParts} parts,{" "}
                {formatBytes(session.fileSize)})
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {isAlbumModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-md rounded-md bg-white p-6 text-sm">
            <h3 className="text-lg font-semibold">create album</h3>
            <p className="mt-1 text-xs text-neutral-500">
              give the album a nice name so u can find it later. like Sir Pooty Pants
            </p>
            <input
              className="mt-4 w-full rounded border px-3 py-2"
              placeholder="album name"
              value={newAlbumName}
              onChange={(event) => setNewAlbumName(event.target.value)}
            />
            {albumError ? (
              <p className="mt-2 text-xs text-red-600">{albumError}</p>
            ) : null}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsAlbumModalOpen(false)}
                className="rounded border border-neutral-200 px-3 py-1 text-xs"
              >
                cancel
              </button>
              <button
                type="button"
                onClick={handleCreateAlbum}
                className="rounded bg-black px-3 py-1 text-xs text-white"
              >
                saveth the album
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

