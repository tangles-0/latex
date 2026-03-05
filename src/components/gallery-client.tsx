"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_RESUMABLE_THRESHOLD,
  KEEP_ORIGINAL_FILE_NAME_STORAGE_KEY,
  uploadSingleMedia,
} from "@/lib/upload-client";
import FancyCheckbox from "@/components/ui/fancy-checkbox";

import { LightCaretRight } from '@energiz3r/icon-library/Icons/Light/LightCaretRight';
import { LightCaretLeft } from '@energiz3r/icon-library/Icons/Light/LightCaretLeft';
import { LightTimes } from '@energiz3r/icon-library/Icons/Light/LightTimes';
import { LightDownload } from '@energiz3r/icon-library/Icons/Light/LightDownload';
import { LightUndo } from '@energiz3r/icon-library/Icons/Light/LightUndo';
import { LightRedo } from '@energiz3r/icon-library/Icons/Light/LightRedo';
import { LightArrowAltUp } from '@energiz3r/icon-library/Icons/Light/LightArrowAltUp';
import { LightArrowAltDown } from '@energiz3r/icon-library/Icons/Light/LightArrowAltDown';
import { LightTrashAlt } from '@energiz3r/icon-library/Icons/Light/LightTrashAlt';
import { LightClock } from '@energiz3r/icon-library/Icons/Light/LightClock';
import { LightPlayCircle } from '@energiz3r/icon-library/Icons/Light/LightPlayCircle';
import { LightEdit } from '@energiz3r/icon-library/Icons/Light/LightEdit';

import { SharePill } from "./share-pill";
import { DitherIcon } from "./icons/dither";
import { ImageViewerContent } from "./viewers/image-viewer-content";
import { FileViewerContent } from "./viewers/file-viewer-content";
import { getFileIconForExtension } from "@/lib/FileIconHelper";

const SHOW_ALBUM_IMAGES_STORAGE_KEY = "latex-gallery-show-album-images";
const ROTATABLE_EXTENSIONS = new Set(["jpg", "jpeg", "png"]);
const INTERNAL_IMAGE_DRAG_TYPE = "application/x-latex-image-id";

type GalleryImage = {
  id: string;
  kind: "image" | "video" | "document" | "other";
  baseName: string;
  originalFileName?: string;
  ext: string;
  mimeType?: string;
  albumId?: string;
  albumCaption?: string;
  albumOrder?: number;
  width?: number;
  height?: number;
  sizeOriginal?: number;
  sizeSm?: number;
  sizeLg?: number;
  previewStatus?: "pending" | "ready" | "failed";
  uploadedAt: string;
  shared?: boolean;
};

type ShareInfo = {
  id: string;
  kind?: "image" | "video" | "document" | "other";
  urls: {
    original: string;
    sm: string;
    lg: string;
  };
};

type UploadMessage = {
  id: string;
  text: string;
  tone: "success" | "error";
};

type RotationDirection = "left" | "right";
const PAGE_SIZE = 24;

export default function GalleryClient({
  media,
  onImagesChange,
  showAlbumImageToggle = true,
  uploadAlbumId,
  hideImagesInAlbums = false,
  kindFilter = "all",
  resumableThresholdBytes = DEFAULT_RESUMABLE_THRESHOLD,
  isAdmin = false,
}: {
  media: GalleryImage[];
  onImagesChange?: (next: GalleryImage[]) => void;
  showAlbumImageToggle?: boolean;
  uploadAlbumId?: string;
  hideImagesInAlbums?: boolean;
  kindFilter?: "all" | "image" | "video" | "document" | "other";
  resumableThresholdBytes?: number;
  isAdmin?: boolean;
}) {
  const [items, setItems] = useState<GalleryImage[]>(media);
  const [active, setActive] = useState<GalleryImage | null>(null);
  const [share, setShare] = useState<ShareInfo | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [isGenerating640, setIsGenerating640] = useState(false);
  const [isChecking640, setIsChecking640] = useState(false);
  const [has640Variant, setHas640Variant] = useState<boolean | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [albums, setAlbums] = useState<{ id: string; name: string }[]>([]);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedAlbumId, setSelectedAlbumId] = useState("");
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [imageToDelete, setImageToDelete] = useState<GalleryImage | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [globalDragging, setGlobalDragging] = useState(false);
  const [messages, setMessages] = useState<UploadMessage[]>([]);
  const [showAlbumImages, setShowAlbumImages] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [isRotating, setIsRotating] = useState(false);
  const [rotateError, setRotateError] = useState<string | null>(null);
  const [isDitherOpen, setIsDitherOpen] = useState(false);
  const [ditherError, setDitherError] = useState<string | null>(null);
  const [previewActionError, setPreviewActionError] = useState<string | null>(null);
  const [isRegeneratingVideoPreview, setIsRegeneratingVideoPreview] = useState(false);
  const [albumEditError, setAlbumEditError] = useState<string | null>(null);
  const [isSavingCaption, setIsSavingCaption] = useState(false);
  const [isSavingOrder, setIsSavingOrder] = useState(false);
  const [captionDraft, setCaptionDraft] = useState("");
  const [isEditingOriginalFileName, setIsEditingOriginalFileName] = useState(false);
  const [isSavingOriginalFileName, setIsSavingOriginalFileName] = useState(false);
  const [originalFileNameDraft, setOriginalFileNameDraft] = useState("");
  const [draggedImageId, setDraggedImageId] = useState<string | null>(null);
  const [dragOverImageId, setDragOverImageId] = useState<string | null>(null);
  const [imageVersionBumps, setImageVersionBumps] = useState<Record<string, number>>({});
  const dragCounter = useRef(0);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const inAlbumContext = Boolean(uploadAlbumId);
  const usePagination = !inAlbumContext;

  useEffect(() => {
    setItems((current) => (current === media ? current : media));
  }, [media]);

  useEffect(() => {
    if (!showAlbumImageToggle) {
      return;
    }
    try {
      const stored = window.localStorage.getItem(SHOW_ALBUM_IMAGES_STORAGE_KEY);
      if (stored === "0") {
        setShowAlbumImages(false);
      }
      if (stored === "1") {
        setShowAlbumImages(true);
      }
    } catch {
      // ignore storage errors
    }
  }, [showAlbumImageToggle]);

  useEffect(() => {
    if (!showAlbumImageToggle) {
      return;
    }
    try {
      window.localStorage.setItem(SHOW_ALBUM_IMAGES_STORAGE_KEY, showAlbumImages ? "1" : "0");
    } catch {
      // ignore storage errors
    }
  }, [showAlbumImages, showAlbumImageToggle]);

  useEffect(() => {
    function isInternalImageDrag(event: DragEvent): boolean {
      const types = event.dataTransfer?.types;
      return Boolean(types && Array.from(types).includes(INTERNAL_IMAGE_DRAG_TYPE));
    }

    function isFileDrag(event: DragEvent): boolean {
      const types = event.dataTransfer?.types;
      return Boolean(
        types &&
          Array.from(types).includes("Files") &&
          !Array.from(types).includes(INTERNAL_IMAGE_DRAG_TYPE),
      );
    }

    function handleDragEnter(event: DragEvent) {
      if (isInternalImageDrag(event)) {
        return;
      }
      if (!isFileDrag(event)) {
        return;
      }
      event.preventDefault();
      dragCounter.current += 1;
      setGlobalDragging(true);
    }

    function handleDragOver(event: DragEvent) {
      if (isInternalImageDrag(event)) {
        return;
      }
      if (!isFileDrag(event)) {
        return;
      }
      event.preventDefault();
    }

    function handleDragLeave(event: DragEvent) {
      if (isInternalImageDrag(event)) {
        return;
      }
      if (!isFileDrag(event)) {
        return;
      }
      event.preventDefault();
      dragCounter.current -= 1;
      if (dragCounter.current <= 0) {
        setGlobalDragging(false);
      }
    }

    function handleDrop(event: DragEvent) {
      if (isInternalImageDrag(event)) {
        return;
      }
      if (!isFileDrag(event)) {
        return;
      }
      event.preventDefault();
      dragCounter.current = 0;
      setGlobalDragging(false);
      const files = event.dataTransfer?.files;
      if (files && files.length > 0) {
        void uploadFiles(files);
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredItems = useMemo(
    () => {
      let next = items;
      if (kindFilter !== "all") {
        next = next.filter((image) => image.kind === kindFilter);
      }
      if (hideImagesInAlbums) {
        next = next.filter((image) => !image.albumId);
      }
      if (showAlbumImageToggle && !showAlbumImages) {
        next = next.filter((image) => !image.albumId);
      }
      return next;
    },
    [hideImagesInAlbums, items, kindFilter, showAlbumImageToggle, showAlbumImages],
  );

  const displayItems = useMemo(
    () =>
      filteredItems.map((image) => {
        const cacheBust = imageVersionBumps[image.id];
        const cacheBustSuffix = cacheBust ? `?v=${cacheBust}` : "";
        const previewExt = image.kind === "image" ? image.ext : "png";
        return {
          ...image,
          thumbUrl: `/media/${image.kind}/${image.id}/${image.baseName}-sm.${previewExt}${cacheBustSuffix}`,
          fullUrl: `/media/${image.kind}/${image.id}/${image.baseName}.${image.ext}${cacheBustSuffix}`,
          lgUrl: `/media/${image.kind}/${image.id}/${image.baseName}-lg.${previewExt}${cacheBustSuffix}`,
        };
      }),
    [filteredItems, imageVersionBumps],
  );
  const totalPages = useMemo(() => {
    if (!usePagination) {
      return 1;
    }
    return Math.max(1, Math.ceil(displayItems.length / PAGE_SIZE));
  }, [displayItems.length, usePagination]);
  const pagedDisplayItems = useMemo(() => {
    if (!usePagination) {
      return displayItems;
    }
    const start = (currentPage - 1) * PAGE_SIZE;
    return displayItems.slice(start, start + PAGE_SIZE);
  }, [currentPage, displayItems, usePagination]);

  const visibleIds = useMemo(() => new Set(filteredItems.map((image) => image.id)), [filteredItems]);
  const selectedIds = useMemo(
    () => Array.from(selected).filter((id) => visibleIds.has(id)),
    [selected, visibleIds],
  );
  const selectedMediaItems = useMemo(
    () =>
      selectedIds
        .map((id) => items.find((item) => item.id === id))
        .filter(Boolean)
        .map((item) => ({ id: item!.id, kind: item!.kind })),
    [items, selectedIds],
  );
  const activeIndex = useMemo(() => {
    if (!active) {
      return -1;
    }
    return displayItems.findIndex((item) => item.id === active.id);
  }, [active, displayItems]);
  const hasPrevious = activeIndex > 0;
  const hasNext = activeIndex >= 0 && activeIndex < displayItems.length - 1;
  const activeDisplayItem = activeIndex >= 0 ? displayItems[activeIndex] : null;
  const isImageActive = active?.kind === "image";
  const supports640Variant = isImageActive && active?.ext.toLowerCase() !== "svg";
  const canRotateActive =
    active && isImageActive ? ROTATABLE_EXTENSIONS.has(active.ext.toLowerCase()) : false;
  const activeDisplayName = active?.originalFileName || active?.baseName || "";

  function displayNameForMedia(image: GalleryImage): string {
    return image.originalFileName || image.baseName;
  }

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

  async function uploadFiles(files: FileList | File[]) {
    const itemsToUpload = Array.from(files);
    if (itemsToUpload.length === 0) {
      pushMessage("Please drop files.", "error");
      return;
    }

    let keepOriginalFileName = false;
    try {
      keepOriginalFileName = window.localStorage.getItem(KEEP_ORIGINAL_FILE_NAME_STORAGE_KEY) === "1";
    } catch {
      keepOriginalFileName = false;
    }

    for (const file of itemsToUpload) {
      if (file.size >= resumableThresholdBytes) {
        window.alert(
          `${file.name} is too large for quick gallery upload. Use the Upload page for large/resumable uploads.`,
        );
        pushMessage(`${file.name}: use Upload page for large files.`, "error");
        continue;
      }
      const result = await uploadSingleMedia(file, uploadAlbumId, {
        keepOriginalFileName,
      });
      pushMessage(result.message, result.ok ? "success" : "error");

      if (result.ok && result.media) {
        setItems((current) => [result.media as GalleryImage, ...current]);
      }
    }
  }

  async function openModal(image: GalleryImage) {
    setActive(image);
    setIsDitherOpen(false);
    setDitherError(null);
    setCaptionDraft(image.albumCaption ?? "");
    setShare(null);
    setShareError(null);
    setRotateError(null);
    setAlbumEditError(null);
    setPreviewActionError(null);
    setIsEditingOriginalFileName(false);
    setIsSavingOriginalFileName(false);
    setOriginalFileNameDraft(image.originalFileName ?? "");
    setHas640Variant(null);
    setIsChecking640(false);

    try {
      const response = await fetch(
        `/api/media-shares?kind=${encodeURIComponent(image.kind)}&mediaId=${encodeURIComponent(image.id)}`,
      );

      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error ?? "Unable to load share info.");
      }

      const payload = (await response.json()) as
        | { share: { id: string }; urls: ShareInfo["urls"] }
        | { share: null };

      if (payload.share) {
        setShare({ id: payload.share.id, urls: payload.urls });
        setItems((current) =>
          current.map((item) =>
            item.id === image.id ? { ...item, shared: true } : item,
          ),
        );
        if (image.kind === "image" && image.ext.toLowerCase() !== "svg") {
          void check640Variant(image.id);
        }
      }
    } catch (error) {
      setShareError(error instanceof Error ? error.message : "Unable to load share info.");
    }
  }

  function closeModal() {
    setActive(null);
    setIsDitherOpen(false);
    setDitherError(null);
    setCaptionDraft("");
    setShare(null);
    setShareError(null);
    setRotateError(null);
    setAlbumEditError(null);
    setPreviewActionError(null);
    setIsEditingOriginalFileName(false);
    setIsSavingOriginalFileName(false);
    setOriginalFileNameDraft("");
    setHas640Variant(null);
    setIsChecking640(false);
  }

  async function regenerateVideoThumbnail() {
    if (!active || active.kind !== "video" || isRegeneratingVideoPreview) {
      return;
    }
    setPreviewActionError(null);
    setIsRegeneratingVideoPreview(true);
    const mediaId = active.id;
    setItems((current) =>
      current.map((item) =>
        item.id === mediaId ? { ...item, previewStatus: "pending" } : item,
      ),
    );
    setActive((current) =>
      current?.id === mediaId ? { ...current, previewStatus: "pending" } : current,
    );
    try {
      const response = await fetch("/api/media/video-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mediaId }),
      });
      const payload = (await response.json()) as { error?: string; previewStatus?: "pending" | "ready" | "failed" };
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to regenerate thumbnail.");
      }
      const nextStatus = payload.previewStatus ?? "ready";
      setItems((current) =>
        current.map((item) =>
          item.id === mediaId ? { ...item, previewStatus: nextStatus } : item,
        ),
      );
      setActive((current) =>
        current?.id === mediaId ? { ...current, previewStatus: nextStatus } : current,
      );
      setImageVersionBumps((current) => ({
        ...current,
        [mediaId]: Date.now(),
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to regenerate thumbnail.";
      setPreviewActionError(message);
      setItems((current) =>
        current.map((item) =>
          item.id === mediaId ? { ...item, previewStatus: "failed" } : item,
        ),
      );
      setActive((current) =>
        current?.id === mediaId ? { ...current, previewStatus: "failed" } : current,
      );
    } finally {
      setIsRegeneratingVideoPreview(false);
    }
  }

  function openPreviousImage() {
    if (!hasPrevious) {
      return;
    }
    const previous = displayItems[activeIndex - 1];
    if (!previous) {
      return;
    }
    void openModal(previous);
  }

  function openNextImage() {
    if (!hasNext) {
      return;
    }
    const next = displayItems[activeIndex + 1];
    if (!next) {
      return;
    }
    void openModal(next);
  }

  async function copyText(text: string, label: string) {
    await navigator.clipboard.writeText(text);
    setCopied(label);
    window.setTimeout(() => setCopied((current) => (current === label ? null : current)), 1200);
  }

  function to640VariantUrl(url: string): string {
    return url.replace(/\.([a-zA-Z0-9]+)$/, "-640.$1");
  }

  function formatBytes(bytes?: number): string {
    if (!bytes || bytes <= 0) {
      return "Unknown";
    }
    const units = ["B", "KB", "MB", "GB", "TB"];
    const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / 1024 ** exponent;
    return `${value >= 10 || exponent === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[exponent]}`;
  }

  async function enableShare(image: GalleryImage): Promise<ShareInfo | null> {
    setShareError(null);
    const response = await fetch("/api/media-shares", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: image.kind, mediaId: image.id }),
    });

    if (!response.ok) {
      const payload = (await response.json()) as { error?: string };
      setShareError(payload.error ?? "Unable to create share link.");
      return null;
    }

    const payload = (await response.json()) as { share: { id: string }; urls: ShareInfo["urls"] };
    const nextShare = { id: payload.share.id, urls: payload.urls };
    setShare(nextShare);
    if (image.kind === "image" && image.ext.toLowerCase() !== "svg") {
      void check640Variant(image.id);
    }
    setItems((current) =>
      current.map((item) =>
        item.id === image.id ? { ...item, shared: true } : item,
      ),
    );
    return nextShare;
  }

  async function disableShare(image: GalleryImage) {
    setShareError(null);
    const response = await fetch("/api/media-shares", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: image.kind, mediaId: image.id }),
    });

    if (!response.ok) {
      const payload = (await response.json()) as { error?: string };
      setShareError(payload.error ?? "Unable to remove share link.");
      return;
    }

    setShare(null);
    setHas640Variant(null);
    setIsChecking640(false);
    setItems((current) =>
      current.map((item) =>
        item.id === image.id ? { ...item, shared: false } : item,
      ),
    );
  }

  async function generate640Link(image: GalleryImage) {
    if (image.kind !== "image") {
      setShareError("640 variant links are only available for images.");
      return;
    }
    if (image.ext.toLowerCase() === "svg") {
      setShareError("640 variant links are not available for SVG images.");
      return;
    }
    if (!share) {
      setShareError("Enable sharing to create a 640x480 link.");
      return;
    }
    setShareError(null);
    setIsGenerating640(true);
    try {
      const variantUrl = to640VariantUrl(share.urls.original);
      const response = await fetch(variantUrl, { cache: "no-store" });
      if (!response.ok) {
        throw new Error("Unable to generate 640x480 image.");
      }

      setHas640Variant(true);
      await copyText(`${origin}${variantUrl}`, "640");
    } catch (error) {
      setShareError(error instanceof Error ? error.message : "Unable to generate 640x480 link.");
    } finally {
      setIsGenerating640(false);
    }
  }

  async function check640Variant(imageId: string) {
    setIsChecking640(true);
    try {
      const response = await fetch(`/api/images/640?imageId=${encodeURIComponent(imageId)}`, {
        cache: "no-store",
      });
      if (!response.ok) {
        setHas640Variant(false);
        return;
      }
      const payload = (await response.json()) as { exists?: boolean };
      setHas640Variant(Boolean(payload.exists));
    } catch {
      setHas640Variant(false);
    } finally {
      setIsChecking640(false);
    }
  }

  async function rotateImage(direction: RotationDirection) {
    if (!active || isRotating || !canRotateActive) {
      return;
    }
    setRotateError(null);
    setIsRotating(true);
    try {
      const response = await fetch("/api/images/rotate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageId: active.id,
          direction,
        }),
      });
      const payload = (await response.json()) as {
        error?: string;
        image?: { width: number; height: number; sizeOriginal?: number; sizeSm?: number; sizeLg?: number };
      };
      if (!response.ok || !payload.image) {
        throw new Error(payload.error ?? "Unable to rotate image.");
      }

      const nextWidth = payload.image.width;
      const nextHeight = payload.image.height;
      const nextSizeOriginal = payload.image.sizeOriginal;
      const nextSizeSm = payload.image.sizeSm;
      const nextSizeLg = payload.image.sizeLg;
      setItems((current) =>
        current.map((item) =>
          item.id === active.id
            ? {
              ...item,
              width: nextWidth,
              height: nextHeight,
              sizeOriginal: nextSizeOriginal,
              sizeSm: nextSizeSm,
              sizeLg: nextSizeLg,
            }
            : item,
        ),
      );
      setActive((current) =>
        current?.id === active.id
          ? {
            ...current,
            width: nextWidth,
            height: nextHeight,
             sizeOriginal: nextSizeOriginal,
             sizeSm: nextSizeSm,
             sizeLg: nextSizeLg,
          }
          : current,
      );
      setImageVersionBumps((current) => ({
        ...current,
        [active.id]: Date.now(),
      }));
    } catch (error) {
      setRotateError(error instanceof Error ? error.message : "Unable to rotate image.");
    } finally {
      setIsRotating(false);
    }
  }

  async function saveDitheredImage(blob: Blob, mode: "update" | "copy") {
    if (!active) {
      throw new Error("No active image selected.");
    }
    const formData = new FormData();
    formData.append("mode", mode);
    formData.append("imageId", active.id);
    formData.append("file", new File([blob], `${active.baseName}.${active.ext}`, { type: blob.type }));

    const response = await fetch("/api/images/dither", {
      method: "POST",
      body: formData,
    });
    const payload = (await response.json()) as {
      error?: string;
      image?: GalleryImage;
    };
    if (!response.ok || !payload.image) {
      throw new Error(payload.error ?? "Unable to save dithered image.");
    }
    return payload.image;
  }

  async function handleDitherSave(blob: Blob) {
    if (!active) {
      return;
    }
    setDitherError(null);
    const updatedImage = await saveDitheredImage(blob, "update");
    setItems((current) =>
      current.map((item) =>
        item.id === updatedImage.id
          ? {
              ...item,
              width: updatedImage.width,
              height: updatedImage.height,
              sizeOriginal: updatedImage.sizeOriginal,
              sizeSm: updatedImage.sizeSm,
              sizeLg: updatedImage.sizeLg,
            }
          : item,
      ),
    );
    setActive((current) =>
      current?.id === updatedImage.id
        ? {
            ...current,
            width: updatedImage.width,
            height: updatedImage.height,
            sizeOriginal: updatedImage.sizeOriginal,
            sizeSm: updatedImage.sizeSm,
            sizeLg: updatedImage.sizeLg,
          }
        : current,
    );
    setImageVersionBumps((current) => ({
      ...current,
      [updatedImage.id]: Date.now(),
    }));
    setIsDitherOpen(false);
    pushMessage("Saved dither changes.", "success");
  }

  async function handleDitherSaveCopy(blob: Blob) {
    setDitherError(null);
    const copiedImage = await saveDitheredImage(blob, "copy");
    setItems((current) => [copiedImage, ...current]);
    setIsDitherOpen(false);
    pushMessage(copiedImage.albumId ? "Saved dither copy to album." : "Saved dither copy to gallery.", "success");
  }

  async function persistAlbumOrder(nextItems: GalleryImage[]) {
    if (!uploadAlbumId) {
      return;
    }
    const imageIds = nextItems.map((item) => item.id);
    const response = await fetch(`/api/albums/${uploadAlbumId}/images/order`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageIds }),
    });
    if (!response.ok) {
      const payload = (await response.json()) as { error?: string };
      throw new Error(payload.error ?? "Unable to reorder images.");
    }
  }

  async function moveActiveImage(delta: -1 | 1) {
    if (!active || !inAlbumContext || isSavingOrder) {
      return;
    }
    const index = items.findIndex((item) => item.id === active.id);
    if (index < 0) {
      return;
    }
    const targetIndex = index + delta;
    if (targetIndex < 0 || targetIndex >= items.length) {
      return;
    }

    setAlbumEditError(null);
    setIsSavingOrder(true);
    const previousItems = items;
    const nextItems = items.slice();
    const [moved] = nextItems.splice(index, 1);
    nextItems.splice(targetIndex, 0, moved);
    setItems(nextItems);
    try {
      await persistAlbumOrder(nextItems);
    } catch (error) {
      setItems(previousItems);
      setAlbumEditError(error instanceof Error ? error.message : "Unable to reorder image.");
    } finally {
      setIsSavingOrder(false);
    }
  }

  async function moveImageByDrag(targetImageId: string) {
    if (!uploadAlbumId || !draggedImageId || draggedImageId === targetImageId || isSavingOrder) {
      return;
    }
    const fromIndex = items.findIndex((item) => item.id === draggedImageId);
    const targetIndex = items.findIndex((item) => item.id === targetImageId);
    if (fromIndex < 0 || targetIndex < 0) {
      return;
    }

    setAlbumEditError(null);
    setIsSavingOrder(true);
    const previousItems = items;
    const nextItems = items.slice();
    const [moved] = nextItems.splice(fromIndex, 1);
    nextItems.splice(targetIndex, 0, moved);
    setItems(nextItems);
    try {
      await persistAlbumOrder(nextItems);
    } catch (error) {
      setItems(previousItems);
      setAlbumEditError(error instanceof Error ? error.message : "Unable to reorder image.");
    } finally {
      setIsSavingOrder(false);
      setDraggedImageId(null);
      setDragOverImageId(null);
    }
  }

  async function saveAlbumCaption() {
    if (!active || !uploadAlbumId || isSavingCaption) {
      return;
    }
    setAlbumEditError(null);
    setIsSavingCaption(true);
    try {
      const response = await fetch(`/api/albums/${uploadAlbumId}/images/${active.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caption: captionDraft }),
      });
      const payload = (await response.json()) as {
        error?: string;
        image?: { albumCaption?: string };
      };
      if (!response.ok || !payload.image) {
        throw new Error(payload.error ?? "Unable to save caption.");
      }
      const nextCaption = payload.image.albumCaption ?? "";
      setCaptionDraft(nextCaption);
      setItems((current) =>
        current.map((item) =>
          item.id === active.id
            ? {
                ...item,
                albumCaption: payload.image?.albumCaption,
              }
            : item,
        ),
      );
      setActive((current) =>
        current?.id === active.id
          ? {
              ...current,
              albumCaption: payload.image?.albumCaption,
            }
          : current,
      );
    } catch (error) {
      setAlbumEditError(error instanceof Error ? error.message : "Unable to save caption.");
    } finally {
      setIsSavingCaption(false);
    }
  }

  async function saveOriginalFileName() {
    if (!active || isSavingOriginalFileName) {
      return;
    }
    setAlbumEditError(null);
    setIsSavingOriginalFileName(true);
    try {
      const response = await fetch("/api/media/file-name", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: active.kind,
          mediaId: active.id,
          originalFileName: originalFileNameDraft.trim() || null,
        }),
      });
      const payload = (await response.json()) as { error?: string; media?: { originalFileName?: string } };
      if (!response.ok || !payload.media) {
        throw new Error(payload.error ?? "Unable to update file name.");
      }
      const nextOriginalFileName = payload.media.originalFileName ?? undefined;
      setItems((current) =>
        current.map((item) =>
          item.id === active.id ? { ...item, originalFileName: nextOriginalFileName } : item,
        ),
      );
      setActive((current) =>
        current?.id === active.id ? { ...current, originalFileName: nextOriginalFileName } : current,
      );
      setOriginalFileNameDraft(nextOriginalFileName ?? "");
      setIsEditingOriginalFileName(false);
    } catch (error) {
      setAlbumEditError(error instanceof Error ? error.message : "Unable to update file name.");
    } finally {
      setIsSavingOriginalFileName(false);
    }
  }

  async function fetchAlbums() {
    const response = await fetch("/api/albums");
    if (!response.ok) {
      return;
    }
    const payload = (await response.json()) as { albums?: { id: string; name: string }[] };
    if (payload.albums) {
      setAlbums(payload.albums);
    }
  }

  async function runBulkAction(action: string, extra?: Record<string, string>) {
    setBulkError(null);
    const response = await fetch("/api/media/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        mediaItems: selectedMediaItems,
        ...extra,
      }),
    });

    if (!response.ok) {
      const payload = (await response.json()) as { error?: string };
      setBulkError(payload.error ?? "Bulk action failed.");
      return false;
    }

    return true;
  }

  async function handleDelete() {
    const ok = await runBulkAction("delete");
    if (!ok) return;
    setItems((current) => current.filter((image) => !selected.has(image.id)));
    setSelected(new Set());
    if (active && selected.has(active.id)) {
      closeModal();
    }
  }

  async function handleDisableSharing() {
    const ok = await runBulkAction("disableSharing");
    if (!ok) return;
    if (active && selected.has(active.id)) {
      setShare(null);
    }
    setItems((current) =>
      current.map((item) =>
        selected.has(item.id) ? { ...item, shared: false } : item,
      ),
    );
    setSelected(new Set());
  }

  async function handleAddToAlbum() {
    if (!selectedAlbumId) {
      setBulkError("Select an album.");
      return;
    }
    const ok = await runBulkAction("addToAlbum", { albumId: selectedAlbumId });
    if (!ok) return;
    setItems((current) =>
      current.map((item) =>
        selected.has(item.id) ? { ...item, albumId: selectedAlbumId } : item,
      ),
    );
    setSelected(new Set());
    setIsAddModalOpen(false);
  }

  async function deleteSingleImage(image: GalleryImage) {
    setDeleteError(null);
    const response = await fetch("/api/media/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", mediaItems: [{ id: image.id, kind: image.kind }] }),
    });

    if (!response.ok) {
      const payload = (await response.json()) as { error?: string };
      setDeleteError(payload.error ?? "Unable to delete image.");
      return;
    }

    setItems((current) => current.filter((item) => item.id !== image.id));
    setSelected((current) => {
      if (!current.has(image.id)) {
        return current;
      }
      const next = new Set(current);
      next.delete(image.id);
      return next;
    });
    if (active?.id === image.id) {
      closeModal();
    }
    setImageToDelete(null);
  }

  useEffect(() => {
    if (!onImagesChange) {
      return;
    }
    if (items === media) {
      return;
    }
    onImagesChange(items);
  }, [items, media, onImagesChange]);

  useEffect(() => {
    const pending = items.filter((item) => item.kind === "video" && item.previewStatus === "pending");
    if (pending.length === 0) {
      return;
    }
    let isMounted = true;
    const interval = window.setInterval(() => {
      const targets = pending.slice(0, 10);
      void Promise.all(
        targets.map(async (item) => {
          const response = await fetch(
            `/api/media/preview-status?kind=${encodeURIComponent(item.kind)}&mediaId=${encodeURIComponent(item.id)}`,
            { cache: "no-store" },
          );
          if (!response.ok) {
            return;
          }
          const payload = (await response.json()) as { previewStatus?: "pending" | "ready" | "failed" };
          if (!payload.previewStatus || !isMounted) {
            return;
          }
          setItems((current) =>
            {
              let changed = false;
              const next = current.map((media) => {
                if (media.id === item.id && media.previewStatus !== payload.previewStatus) {
                  changed = true;
                  return { ...media, previewStatus: payload.previewStatus };
                }
                return media;
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
  }, [items]);

  useEffect(() => {
    if (!usePagination) {
      return;
    }
    setCurrentPage((current) => {
      if (current < 1) return 1;
      if (current > totalPages) return totalPages;
      return current;
    });
  }, [totalPages, usePagination]);

  useEffect(() => {
    if (!usePagination) {
      return;
    }
    setCurrentPage(1);
  }, [hideImagesInAlbums, kindFilter, showAlbumImageToggle, showAlbumImages, usePagination]);

  useEffect(() => {
    if (!active) {
      return;
    }
    if (activeIndex === -1) {
      closeModal();
      return;
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        openPreviousImage();
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        openNextImage();
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        void moveActiveImage(-1);
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        void moveActiveImage(1);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        closeModal();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, activeIndex, displayItems, hasNext, hasPrevious]);

  return (
    <>
      {globalDragging ? (
        <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-black/30">
          <div className="rounded border border-dashed border-white px-6 py-4 text-sm text-white">
            Drop files to upload
          </div>
        </div>
      ) : null}

      {messages.length > 0 ? (
        <div className="fixed top-4 left-1/2 z-50 w-full max-w-md -translate-x-1/2 space-y-2 px-4">
          {messages.map((item) => (
            <div
              key={item.id}
              className={`rounded border px-3 py-2 text-xs shadow ${item.tone === "success"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-red-200 bg-red-50 text-red-700"
                }`}
            >
              {item.text}
            </div>
          ))}
        </div>
      ) : null}

      {selectedIds.length > 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded border border-neutral-200 px-4 py-2 text-xs">
          <span>{selectedIds.length} selected</span>
          <button
            type="button"
            onClick={() => {
              setBulkError(null);
              setIsAddModalOpen(true);
              void fetchAlbums();
            }}
            className="rounded border border-neutral-200 px-3 py-1"
          >
            Add to album
          </button>
          <button
            type="button"
            onClick={handleDisableSharing}
            className="rounded border border-neutral-200 px-3 py-1"
          >
            Disable sharing
          </button>
          <button
            type="button"
            onClick={handleDelete}
            className="rounded border border-red-200 px-3 py-1 text-red-600"
          >
            Delete
          </button>
          {bulkError ? <span className="text-red-600">{bulkError}</span> : null}
        </div>
      ) : null}

      {showAlbumImageToggle ? (
        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={() => setShowAlbumImages((current) => !current)}
            className="rounded border border-neutral-200 px-3 py-1 text-xs"
          >
            {showAlbumImages ? "Hide images in albums" : "Show images in albums"}
          </button>
        </div>
      ) : null}

      {displayItems.length === 0 ? (
        <div className="rounded-md border border-dashed border-neutral-300 p-6 text-center text-neutral-500">
          {items.length === 0
            ? "No uploads yet. Drop files anywhere on this page or head to the upload page."
            : "No files to show with the current filter."}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid justify-center gap-4 sm:[grid-template-columns:repeat(auto-fit,minmax(240px,320px))] [grid-template-columns:repeat(auto-fit,minmax(240px,100%))]">
          {pagedDisplayItems.map((image) => (
            <div
              key={image.id}
              draggable={inAlbumContext}
              onDragStart={(event) => {
                if (!inAlbumContext) {
                  return;
                }
                setAlbumEditError(null);
                setDraggedImageId(image.id);
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData(INTERNAL_IMAGE_DRAG_TYPE, image.id);
                event.dataTransfer.setData("text/plain", image.id);
              }}
              onDragOver={(event) => {
                if (!inAlbumContext || !draggedImageId || draggedImageId === image.id) {
                  return;
                }
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                setDragOverImageId(image.id);
              }}
              onDragLeave={() => {
                if (dragOverImageId === image.id) {
                  setDragOverImageId(null);
                }
              }}
              onDrop={(event) => {
                if (!inAlbumContext) {
                  return;
                }
                event.preventDefault();
                void moveImageByDrag(image.id);
              }}
              onDragEnd={() => {
                setDraggedImageId(null);
                setDragOverImageId(null);
              }}
              className={`gallery-tile relative overflow-hidden rounded-md border text-left ${
                dragOverImageId === image.id
                  ? "border-black ring-2 ring-black/20"
                  : "border-neutral-200"
              } ${draggedImageId === image.id ? "opacity-70" : ""}`}
            >
              <SharePill isShared={image.shared} absolutePosition />
              <FancyCheckbox
                className="tile-control absolute left-1 top-1 z-10 text-xs"
                checked={selected.has(image.id)}
                onChange={(checked) => {
                  const next = new Set(selected);
                  if (checked) {
                    next.add(image.id);
                  } else {
                    next.delete(image.id);
                  }
                  setSelected(next);
                }}
              />
              <button
                type="button"
                onClick={() => setImageToDelete(image)}
                className="tile-control absolute right-1 top-1 z-10 rounded p-1"
                aria-label="Delete image"
                title="Delete image"
              >
                <LightTrashAlt className="h-4 w-4" fill="currentColor" />
              </button>
              <button type="button" onClick={() => openModal(image)} className="block w-full">
                {image.kind === "video" && image.previewStatus !== "ready" ? (
                  <div className="mt-2 flex h-48 max-h-64 w-full items-center justify-center rounded border border-dashed border-neutral-300 bg-neutral-50">
                    <div className="flex flex-col items-center gap-2 text-xs text-neutral-500">
                      <LightClock className="h-8 w-8" fill="currentColor" />
                      <span>preview pending</span>
                    </div>
                  </div>
                ) : image.kind === "document" && image.previewStatus !== "ready" ? (
                  <div className="mt-2 flex h-48 max-h-64 w-full items-center justify-center rounded border border-dashed border-neutral-300 bg-neutral-50">
                    {(() => {
                      const Icon = getFileIconForExtension(image.ext);
                      return <Icon className="h-10 w-10 text-neutral-500" fill="currentColor" />;
                    })()}
                  </div>
                ) : image.kind === "other" ? (
                  <div className="mt-2 flex h-48 max-h-64 w-full items-center justify-center rounded border border-dashed border-neutral-300 bg-neutral-50">
                    {(() => {
                      const Icon = getFileIconForExtension(image.ext);
                      return <Icon className="h-10 w-10 text-neutral-500" fill="currentColor" />;
                    })()}
                  </div>
                ) : (
                  <div className="relative mt-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={image.thumbUrl}
                      alt="Uploaded"
                      className="sm:h-48 max-h-64 w-full object-cover"
                      loading="lazy"
                      draggable={false}
                      onDragStart={(event) => event.preventDefault()}
                    />
                    {image.kind === "video" ? (
                      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                        <LightPlayCircle className="h-12 w-12 text-white/75 drop-shadow-[0_1px_2px_rgba(0,0,0,0.55)]" fill="currentColor" opacity={0.5} />
                      </div>
                    ) : null}
                  </div>
                )}
              </button>
              <div className="flex items-center justify-between px-3 py-2 text-xs text-neutral-500">
                <span className="truncate">{displayNameForMedia(image)}</span>
                <span>
                  {image.width && image.height ? `${image.width}×${image.height}` : image.kind}
                </span>
              </div>
              {inAlbumContext && image.albumCaption ? (
                <p className="px-3 pb-3 text-xs text-neutral-600">{image.albumCaption}</p>
              ) : null}
            </div>
          ))}
          </div>
          {usePagination && totalPages > 1 ? (
            <div className="flex items-center justify-center gap-2 text-xs">
              <button
                type="button"
                onClick={() => setCurrentPage((current) => Math.max(1, current - 1))}
                disabled={currentPage <= 1}
                className="rounded border border-neutral-200 px-3 py-1 disabled:opacity-50"
              >
                Previous
              </button>
              <span>
                Page {currentPage} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setCurrentPage((current) => Math.min(totalPages, current + 1))}
                disabled={currentPage >= totalPages}
                className="rounded border border-neutral-200 px-3 py-1 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          ) : null}
        </div>
      )}

      {active ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 sm:px-4 sm:py-6" onKeyDown={(event) => {
          if (event.key === "ArrowLeft") {
            event.preventDefault();
            openPreviousImage();
          }
          if (event.key === "ArrowRight") {
            event.preventDefault();
            openNextImage();
          }
          if (event.key === "ArrowUp") {
            event.preventDefault();
            void moveActiveImage(-1);
          }
          if (event.key === "ArrowDown") {
            event.preventDefault();
            void moveActiveImage(1);
          }
          if (event.key === "Escape") {
            event.preventDefault();
            closeModal();
          }
        }}>
          <div className="max-h-full w-full max-w-3xl overflow-y-auto overflow-x-hidden sm:rounded-md bg-white p-2 sm:p-6 text-sm">
            <div className="flex sm:flex-row flex-col items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">file details</h2>
                <div className="mt-1 flex items-center gap-2">
                  {isEditingOriginalFileName ? (
                    <>
                      <input
                        value={originalFileNameDraft}
                        onChange={(event) => setOriginalFileNameDraft(event.target.value)}
                        className="w-full rounded border border-neutral-200 px-2 py-1 text-xs"
                        placeholder={active.baseName}
                        maxLength={255}
                      />
                      <button
                        type="button"
                        onClick={() => void saveOriginalFileName()}
                        disabled={isSavingOriginalFileName}
                        className="rounded border border-neutral-200 px-2 py-1 text-xs disabled:opacity-50"
                      >
                        {isSavingOriginalFileName ? "Saving..." : "Save"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setIsEditingOriginalFileName(false);
                          setOriginalFileNameDraft(active.originalFileName ?? "");
                        }}
                        className="rounded border border-neutral-200 px-2 py-1 text-xs"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <p className="text-xs text-neutral-500">{activeDisplayName}</p>
                      <button
                        type="button"
                        onClick={() => setIsEditingOriginalFileName(true)}
                        className="rounded border border-neutral-200 p-1 text-neutral-500"
                        aria-label="Edit file name"
                        title="Edit file name"
                      >
                        <LightEdit className="h-4 w-4" fill="currentColor" />
                      </button>
                    </>
                  )}
                </div>
                {activeIndex >= 0 ? (
                  <p className="text-xs text-neutral-500">
                    {activeIndex + 1} / {displayItems.length}
                  </p>
                ) : null}
              </div>
              <div className="w-full sm:w-auto flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={openPreviousImage}
                  disabled={!hasPrevious}
                  className="rounded border border-neutral-200 px-2 py-1 text-xs disabled:opacity-50"
                >
                  <LightCaretLeft className="h-4 w-4" fill="currentColor" />
                </button>
                <button
                  type="button"
                  onClick={openNextImage}
                  disabled={!hasNext}
                  className="rounded border border-neutral-200 px-2 py-1 text-xs disabled:opacity-50"
                >
                  <LightCaretRight className="h-4 w-4" fill="currentColor" />
                </button>
                {inAlbumContext ? (
                  <>
                    <button
                      type="button"
                      onClick={() => void moveActiveImage(-1)}
                      disabled={!hasPrevious || isSavingOrder}
                      className="rounded border border-neutral-200 px-2 py-1 text-xs disabled:opacity-50"
                      title="Move earlier in album"
                    >
                      <LightArrowAltUp className="h-4 w-4" fill="currentColor" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void moveActiveImage(1)}
                      disabled={!hasNext || isSavingOrder}
                      className="rounded border border-neutral-200 px-2 py-1 text-xs disabled:opacity-50"
                      title="Move later in album"
                    >
                      <LightArrowAltDown className="h-4 w-4" fill="currentColor" />
                    </button>
                  </>
                ) : null}
                {isImageActive ? (
                  <>
                    <button
                      type="button"
                      onClick={() => void rotateImage("left")}
                      disabled={!canRotateActive || isRotating}
                      className="rounded border border-neutral-200 px-2 py-1 text-xs disabled:cursor-not-allowed disabled:border-neutral-200 disabled:text-neutral-300"
                      aria-label="Rotate image left"
                      title={
                        canRotateActive
                          ? "Rotate left 90 degrees"
                          : "Rotation is only available for JPG and PNG images."
                      }
                    >
                      <LightUndo className="h-4 w-4" fill="currentColor" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void rotateImage("right")}
                      disabled={!canRotateActive || isRotating}
                      className="rounded border border-neutral-200 px-2 py-1 text-xs disabled:cursor-not-allowed disabled:border-neutral-200 disabled:text-neutral-300"
                      aria-label="Rotate image right"
                      title={
                        canRotateActive
                          ? "Rotate right 90 degrees"
                          : "Rotation is only available for JPG and PNG images."
                      }
                    >
                      <LightRedo className="h-4 w-4" fill="currentColor" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDitherError(null);
                        setIsDitherOpen((current) => !current);
                      }}
                      className={`rounded border px-2 py-1 text-xs ${
                        isDitherOpen ? "border-black bg-black text-white" : "border-neutral-200"
                      }`}
                      title="Open dither controls"
                    >
                      <DitherIcon className="h-4 w-4" fill="currentColor" />
                    </button>
                  </>
                ) : null}
                <button
                  type="button"
                  onClick={() => {
                    const downloadUrl = `/media/${active.kind}/${active.id}/${active.baseName}.${active.ext}`;
                    const link = document.createElement("a");
                    link.href = downloadUrl;
                    link.download = `${active.baseName}.${active.ext}`;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                  }}
                  className="rounded border border-neutral-200 px-2 py-1 text-xs"
                  aria-label="Download image"
                  title="Download image"
                >
                  <LightDownload className="h-4 w-4" fill="currentColor" />
                </button>
                <button
                  type="button"
                  onClick={closeModal}
                  className="rounded border border-neutral-200 px-2 py-1 text-xs"
                >
                  <LightTimes className="h-4 w-4" fill="currentColor" />
                </button>
              </div>
            </div>

            <div className="mt-4 grid min-w-0 gap-4 lg:grid-cols-[2fr,1fr]">
              <div className="space-y-3">
                {active.kind === "image" ? (
                  <ImageViewerContent
                    imageUrl={activeDisplayItem?.lgUrl ?? `/media/${active.kind}/${active.id}/${active.baseName}-lg.${active.ext}`}
                    imageName={active.baseName}
                    outputExt={active.ext}
                    isDitherOpen={isDitherOpen}
                    onCancelDither={() => {
                      setDitherError(null);
                      setIsDitherOpen(false);
                    }}
                    onSaveDither={async (blob) => {
                      try {
                        await handleDitherSave(blob);
                      } catch (error) {
                        setDitherError(error instanceof Error ? error.message : "Unable to save dithered image.");
                        throw error;
                      }
                    }}
                    onSaveCopyDither={async (blob) => {
                      try {
                        await handleDitherSaveCopy(blob);
                      } catch (error) {
                        setDitherError(
                          error instanceof Error ? error.message : "Unable to save dithered image copy.",
                        );
                        throw error;
                      }
                    }}
                  />
                ) : (
                  <FileViewerContent
                    isAdmin={isAdmin}
                    kind={active.kind}
                    previewStatus={active.previewStatus}
                    fullUrl={activeDisplayItem?.fullUrl ?? `/media/${active.kind}/${active.id}/${active.baseName}.${active.ext}`}
                    previewUrl={activeDisplayItem?.lgUrl ?? `/media/${active.kind}/${active.id}/${active.baseName}-lg.png`}
                    ext={active.ext}
                    mimeType={active.mimeType}
                    onRegenerateThumbnail={
                      active.kind === "video" ? () => void regenerateVideoThumbnail() : undefined
                    }
                    isRegeneratingThumbnail={active.kind === "video" ? isRegeneratingVideoPreview : false}
                  />
                )}
              </div>

              <div className="min-w-0 space-y-3">
                <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 rounded border border-neutral-200 p-3 text-xs text-neutral-600">
                  <div className="min-w-0">
                    <div>
                      Dimensions: {active.width && active.height ? `${active.width}×${active.height}` : "n/a"}
                    </div>
                    <div>File size: {formatBytes(active.sizeOriginal)}</div>
                    <div>Uploaded: {new Date(active.uploadedAt).toLocaleString()}</div>
                  </div>
                  <div className="justify-self-center">
                    <SharePill isShared={Boolean(share)} shouldShowOff />
                  </div>
                  <div className="justify-self-end">
                    <button
                      type="button"
                      onClick={() =>
                        void (share ? disableShare(active) : enableShare(active))
                      }
                      className={`rounded px-3 py-1 text-xs ${share ? "bg-black text-white" : "border border-neutral-200"
                        }`}
                    >
                      {share ? "disable" : "enable"}
                    </button>
                  </div>
                </div>

                {shareError ? <p className="text-xs text-red-600">{shareError}</p> : null}
                {rotateError ? <p className="text-xs text-red-600">{rotateError}</p> : null}
                {ditherError ? <p className="text-xs text-red-600">{ditherError}</p> : null}
                {previewActionError ? <p className="text-xs text-red-600">{previewActionError}</p> : null}
                {albumEditError ? <p className="text-xs text-red-600">{albumEditError}</p> : null}

                {inAlbumContext ? (
                  <div className="space-y-2 rounded border border-neutral-200 p-3">
                    <label className="text-xs font-medium text-neutral-600">Caption (album only)</label>
                    <textarea
                      value={captionDraft}
                      onChange={(event) => setCaptionDraft(event.target.value)}
                      className="min-h-20 w-full rounded border border-neutral-200 px-3 py-2 text-xs"
                      maxLength={1000}
                      placeholder="Add a caption for this image in this album."
                    />
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-neutral-500">{captionDraft.length} / 1000</span>
                      <button
                        type="button"
                        onClick={() => void saveAlbumCaption()}
                        disabled={isSavingCaption}
                        className="rounded border border-neutral-200 px-3 py-1 text-xs disabled:opacity-50"
                      >
                        {isSavingCaption ? "Saving..." : "Save caption"}
                      </button>
                    </div>
                  </div>
                ) : null}

                {share ? (
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-neutral-600">Direct link</label>
                      <button
                        type="button"
                        onClick={() => copyText(`${origin}${share.urls.original}`, "direct")}
                        className={`w-full max-w-full break-all rounded border border-neutral-200 px-3 py-2 text-left text-xs ${copied === "direct" ? "text-emerald-600" : ""}`}
                      >
                        {copied === "direct" ? "Copied link to clipboard!" : 
                        `${origin}${share.urls.original}`}
                      </button>
                    </div>

                    {active.kind === "image" ? (
                      <div className="space-y-2">
                        <label className="text-xs font-medium text-neutral-600">BBCode</label>
                        <button
                          type="button"
                          onClick={() =>
                            copyText(`[img]${origin}${share.urls.original}[/img]`, "bbcode")
                          }
                          className={`w-full max-w-full break-all rounded border border-neutral-200 px-3 py-2 text-left text-xs ${copied === "bbcode" ? "text-emerald-600" : ""}`}
                        >
                          {copied === "bbcode" ? "Copied link to clipboard!" : 
                          `[img]${origin}${share.urls.original}[/img]`}
                        </button>
                      </div>
                    ) : null}

                    <div className="space-y-2">
                      <label className="text-xs font-medium text-neutral-600">
                        Linked BBCode
                      </label>
                      {active.kind === "image" ? (
                        <button
                          type="button"
                          onClick={() =>
                            copyText(
                              `[url=${origin}${share.urls.original}][img]${origin}${share.urls.sm}[/img][/url]`,
                              "linked",
                            )
                          }
                          className={`w-full max-w-full break-all rounded border border-neutral-200 px-3 py-2 text-left text-xs ${copied === "linked" ? "text-emerald-600" : ""}`}
                        >
                          {copied === "linked" ? "Copied link to clipboard!" : 
                          `[url=${origin}${share.urls.original}][img]${origin}${share.urls.sm}[/img][/url]`}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            copyText(
                              `[url]${origin}${share.urls.original}[/url]`,
                              "linked",
                            )
                          }
                          className={`w-full max-w-full break-all rounded border border-neutral-200 px-3 py-2 text-left text-xs ${copied === "linked" ? "text-emerald-600" : ""}`}
                        >
                          {copied === "linked" ? "Copied link to clipboard!" : 
                          `[url]${origin}${share.urls.original}[/url]`}
                        </button>
                      )}
                    </div>

                    {supports640Variant ? (
                      <div className="space-y-2">
                        <label className="text-xs font-medium text-neutral-600">
                          Direct link (max size 640x480)
                        </label>
                        {isChecking640 ? (
                          <div className="w-full max-w-full break-all rounded border border-neutral-200 px-3 py-2 text-left text-xs text-neutral-500">
                            Checking 640x480 variant...
                          </div>
                        ) : has640Variant ? (
                          <button
                            type="button"
                            onClick={() =>
                              copyText(
                                `${origin}${to640VariantUrl(share.urls.original)}`,
                                "640",
                              )
                            }
                            className={`w-full max-w-full break-all rounded border border-neutral-200 px-3 py-2 text-left text-xs ${copied === "640" ? "text-emerald-600" : ""}`}
                          >
                            {copied === "640" ? "Copied link to clipboard!" :
                            `${origin}${to640VariantUrl(share.urls.original)}`}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void generate640Link(active)}
                            disabled={isGenerating640}
                            className="w-full rounded border border-neutral-200 px-3 py-2 text-xs disabled:opacity-50"
                          >
                            {isGenerating640 ? "Generating..." : "Generate 640x480 image"}
                          </button>
                        )}
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <p className="text-xs text-neutral-500 text-center">
                    Share links are disabled for this image.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {isAddModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-md rounded-md bg-white p-6 text-sm">
            <h3 className="text-lg font-semibold">Add to album</h3>
            <p className="mt-1 text-xs text-neutral-500">
              Choose an album to add {selectedIds.length} file
              {selectedIds.length === 1 ? "" : "s"} to.
            </p>
            <select
              value={selectedAlbumId}
              onChange={(event) => setSelectedAlbumId(event.target.value)}
              className="mt-4 w-full rounded border px-3 py-2"
            >
              <option value="">Select an album</option>
              {albums.map((album) => (
                <option key={album.id} value={album.id}>
                  {album.name}
                </option>
              ))}
            </select>
            {bulkError ? <p className="mt-2 text-xs text-red-600">{bulkError}</p> : null}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="rounded border border-neutral-200 px-3 py-1 text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddToAlbum}
                className="rounded bg-black px-3 py-1 text-xs text-white"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {imageToDelete ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-md rounded-md bg-white p-6 text-sm">
            <h3 className="text-lg font-semibold">Delete image?</h3>
            <p className="mt-1 text-xs text-neutral-500">
              This will permanently delete the file and its share links.
            </p>
            {deleteError ? (
              <p className="mt-2 text-xs text-red-600">{deleteError}</p>
            ) : null}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setImageToDelete(null)}
                className="rounded border border-neutral-200 px-3 py-1 text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void deleteSingleImage(imageToDelete)}
                className="rounded bg-red-600 px-3 py-1 text-xs text-white"
              >
                Delete file
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

