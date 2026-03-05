"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import GalleryClient from "@/components/gallery-client";
import { LightPencil } from '@energiz3r/icon-library/Icons/Light/LightPencil';
import { LightTrashAlt } from "@energiz3r/icon-library/Icons/Light/LightTrashAlt";

const HIDE_ALBUM_IMAGES_STORAGE_KEY = "latex-gallery-hide-album-images";

type AlbumInfo = {
  id: string;
  name: string;
};

type GalleryImage = {
  id: string;
  kind: "image" | "video" | "document" | "other";
  baseName: string;
  originalFileName?: string;
  ext: string;
  mimeType?: string;
  albumId?: string;
  width?: number;
  height?: number;
  uploadedAt: string;
  shared?: boolean;
  previewStatus?: "pending" | "ready" | "failed";
};

export default function GalleryTabs({
  albums,
  media,
  initialTab = "files",
  resumableThresholdBytes,
  isAdmin,
}: {
  albums: AlbumInfo[];
  media: GalleryImage[];
  initialTab?: "albums" | "files";
  resumableThresholdBytes?: number;
  isAdmin?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [imageItems, setImageItems] = useState<GalleryImage[]>(media);
  const [activeTab, setActiveTab] = useState<"albums" | "files">(initialTab);
  const [fileTypeFilter, setFileTypeFilter] = useState<"all" | "image" | "video" | "document" | "other">("all");
  const [albumItems, setAlbumItems] = useState(albums);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newAlbumName, setNewAlbumName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [albumToDelete, setAlbumToDelete] = useState<AlbumInfo | null>(null);
  const [albumToRename, setAlbumToRename] = useState<AlbumInfo | null>(null);
  const [renameAlbumName, setRenameAlbumName] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  let storedSetting = "";
  try {
    storedSetting = window.localStorage.getItem(HIDE_ALBUM_IMAGES_STORAGE_KEY) ?? "0";
  } catch {} // ignore storage errors
  const [hideAlbumImages, setHideAlbumImages] = useState(storedSetting === "1");
  const [delBtnLabel, setDelBtnLabel] = useState("del album");

  useEffect(() => {
    try {
      window.localStorage.setItem(HIDE_ALBUM_IMAGES_STORAGE_KEY, hideAlbumImages ? "1" : "0");
    } catch {} // ignore storage errors
  }, [hideAlbumImages]);

  const albumPreviews = albumItems.map((album) => {
    const previews = imageItems
      .filter((image) => image.albumId === album.id && image.kind === "image")
      .slice(0, 3)
      .map((image) => ({ id: image.id, kind: image.kind, baseName: image.baseName, ext: image.ext }));
    return { ...album, previews };
  });

  function setTab(next: "albums" | "files") {
    setActiveTab(next);
    const params = new URLSearchParams(searchParams.toString());
    if (next === "albums") {
      params.set("tab", "albums");
    } else if (next === "files") {
      params.delete("tab");
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  async function createAlbum() {
    const name = newAlbumName.trim();
    if (!name) {
      setCreateError("Album name is required.");
      return;
    }
    setCreateError(null);
    const response = await fetch("/api/albums", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });

    if (!response.ok) {
      const payload = (await response.json()) as { error?: string };
      setCreateError(payload.error ?? "Unable to create album.");
      return;
    }

    const payload = (await response.json()) as { album: { id: string; name: string } };
    setAlbumItems((current) => [...current, payload.album].sort((a, b) => a.name.localeCompare(b.name)));
    setNewAlbumName("");
    setIsCreateOpen(false);
  }

  async function deleteAlbum(album: AlbumInfo) {
    setDeleteError(null);
    const response = await fetch(`/api/albums/${album.id}`, { method: "DELETE" });
    if (!response.ok) {
      const payload = (await response.json()) as { error?: string };
      setDeleteError(payload.error ?? "Unable to delete album.");
      return;
    }

    setAlbumItems((current) => current.filter((item) => item.id !== album.id));
    setImageItems((current) =>
      current.map((image) =>
        image.albumId === album.id ? { ...image, albumId: undefined } : image,
      ),
    );
    setAlbumToDelete(null);
  }

  async function renameAlbum() {
    if (!albumToRename) {
      return;
    }
    const name = renameAlbumName.trim();
    if (!name) {
      setRenameError("Album name is required.");
      return;
    }
    setRenameError(null);
    const response = await fetch(`/api/albums/${albumToRename.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!response.ok) {
      const payload = (await response.json()) as { error?: string };
      setRenameError(payload.error ?? "Unable to rename album.");
      return;
    }
    const payload = (await response.json()) as { album: AlbumInfo };
    setAlbumItems((current) =>
      current
        .map((item) => (item.id === payload.album.id ? payload.album : item))
        .sort((a, b) => a.name.localeCompare(b.name)),
    );
    setAlbumToRename(null);
    setRenameAlbumName("");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-xs">
        <button
          type="button"
          onClick={() => setTab("albums")}
          className={`rounded px-3 py-1 ${
            activeTab === "albums" ? "bg-black text-white" : "border border-neutral-200"
          }`}
        >
          albums
        </button>
        <button
          type="button"
          onClick={() => setTab("files")}
          className={`rounded px-3 py-1 ${
            activeTab === "files" ? "bg-black text-white" : "border border-neutral-200"
          }`}
        >
          files
        </button>
        {activeTab === "files" ? (
          <button
            type="button"
            onClick={() => setHideAlbumImages((current) => !current)}
            className="rounded border border-neutral-200 px-3 py-1"
          >
            {hideAlbumImages ? "show album files" : "hide album files"}
          </button>
        ) : null}
        {activeTab === "albums" ? (
          <button
            type="button"
            onClick={() => {
              setCreateError(null);
              setIsCreateOpen(true);
            }}
            className="rounded border border-neutral-200 px-3 py-1"
          >
            + new
          </button>
        ) : null}
      </div>
      {activeTab === "files" ? (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {(["all", "image", "video", "document", "other"] as const).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setFileTypeFilter(item)}
              className={`rounded px-3 py-1 ${
                fileTypeFilter === item ? "bg-black text-white" : "border border-neutral-200"
              }`}
            >
              {item === "image" ? "images" : item === "document" ? "documents" : item}
            </button>
          ))}
        </div>
      ) : null}

      {activeTab === "albums" ? (
        <div className="space-y-4">
          {albumPreviews.length === 0 ? (
            <div className="rounded-md border border-dashed border-neutral-300 p-6 text-center text-neutral-500">
              no albums yet. make one to get started.
            </div>
          ) : (
            <div className="grid justify-center gap-4 [grid-template-columns:repeat(auto-fit,minmax(240px,320px))]">
              {albumPreviews.map((album) => (
                <div key={album.id} className="relative">
                  <Link
                    href={`/album/${album.id}`}
                    className="block rounded-md border border-neutral-200 p-3"
                  >
                    <div className="grid grid-cols-3 gap-2">
                      {album.previews.length > 0 ? (
                        album.previews.map((image) => (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img
                            key={image.id}
                            src={`/media/${image.kind}/${image.id}/${image.baseName}-sm.${image.ext}`}
                            alt="album preview"
                            className="h-20 w-full rounded object-cover"
                          />
                        ))
                      ) : (
                        <div className="col-span-3 flex h-20 items-center justify-center rounded border border-dashed text-xs text-neutral-400">
                          no imgs yet. go snap some selfiez or smth
                        </div>
                      )}
                    </div>
                    <div className="mt-3 text-sm font-medium">{album.name}</div>
                    <div className="text-xs text-neutral-500">
                      {album.previews.length} preview{album.previews.length === 1 ? "" : "s"}
                    </div>
                  </Link>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setRenameError(null);
                      setAlbumToRename({ id: album.id, name: album.name });
                      setRenameAlbumName(album.name);
                    }}
                    className="tile-control absolute right-10 top-2 rounded p-1 text-[11px]"
                    aria-label="rename album"
                    title="rename album"
                  >
                    <LightPencil className="h-4 w-4" fill="currentColor" />
                  </button>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setAlbumToDelete({ id: album.id, name: album.name });
                    }}
                    className="tile-control absolute right-2 top-2 rounded p-1"
                    aria-label="delete album"
                    title="rm -rf this album"
                  >
                    <LightTrashAlt className="h-4 w-4" fill="currentColor" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {isCreateOpen ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
              <div className="w-full max-w-md rounded-md bg-white p-6 text-sm">
                <h3 className="text-lg font-semibold">new album</h3>
                <p className="mt-1 text-xs text-neutral-500">
                  give the album a nice name. like geoff
                </p>
                <input
                  className="mt-4 w-full rounded border px-3 py-2"
                  placeholder="album name"
                  value={newAlbumName}
                  onChange={(event) => setNewAlbumName(event.target.value)}
                />
                {createError ? (
                  <p className="mt-2 text-xs text-red-600">{createError}</p>
                ) : null}
                <div className="mt-4 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsCreateOpen(false)}
                    className="rounded border border-neutral-200 px-3 py-1 text-xs"
                  >
                    cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void createAlbum()}
                    className="rounded bg-black px-3 py-1 text-xs text-white"
                  >
                    mk new album
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {albumToDelete ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
              <div className="w-full max-w-md rounded-md bg-white p-6 text-sm">
                <h3 className="text-lg font-semibold">delete album?</h3>
                <p className="mt-1 text-xs text-neutral-500">
                  this deletes the album only. imgs will stay in ur library. 0.5% chance of nuclear winter.
                </p>
                {deleteError ? (
                  <p className="mt-2 text-xs text-red-600">{deleteError}</p>
                ) : null}
                <div className="mt-4 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setAlbumToDelete(null)}
                    className="rounded border border-neutral-200 px-3 py-1 text-xs"
                  >
                    cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void deleteAlbum(albumToDelete)}
                    className="rounded bg-red-600 px-3 py-1 text-xs text-white"
                    onMouseEnter={() => setDelBtnLabel("del entire acct (jk)")}
                    onMouseLeave={() => setDelBtnLabel("del album")}
                  >
                    {delBtnLabel}
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {albumToRename ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
              <div className="w-full max-w-md rounded-md bg-white p-6 text-sm">
                <h3 className="text-lg font-semibold">rename album</h3>
                <p className="mt-1 text-xs text-neutral-500">
                  give this album a fresh new label.
                </p>
                <input
                  className="mt-4 w-full rounded border px-3 py-2"
                  placeholder="album name"
                  value={renameAlbumName}
                  onChange={(event) => setRenameAlbumName(event.target.value)}
                />
                {renameError ? (
                  <p className="mt-2 text-xs text-red-600">{renameError}</p>
                ) : null}
                <div className="mt-4 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setAlbumToRename(null)}
                    className="rounded border border-neutral-200 px-3 py-1 text-xs"
                  >
                    cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void renameAlbum()}
                    className="rounded bg-black px-3 py-1 text-xs text-white"
                  >
                    save
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <GalleryClient
          media={imageItems}
          onImagesChange={setImageItems}
          showAlbumImageToggle={false}
          hideImagesInAlbums={hideAlbumImages}
          kindFilter={fileTypeFilter}
          resumableThresholdBytes={resumableThresholdBytes}
          isAdmin={isAdmin}
        />
      )}
    </div>
  );
}

