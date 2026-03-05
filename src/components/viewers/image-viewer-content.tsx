"use client";

import { DitherEditor } from "@/components/dither-editor";

export function ImageViewerContent({
  imageUrl,
  imageName,
  outputExt,
  isDitherOpen,
  onCancelDither,
  onSaveDither,
  onSaveCopyDither,
}: {
  imageUrl: string;
  imageName: string;
  outputExt: string;
  isDitherOpen: boolean;
  onCancelDither: () => void;
  onSaveDither: (blob: Blob) => Promise<void>;
  onSaveCopyDither: (blob: Blob) => Promise<void>;
}) {
  if (isDitherOpen) {
    return (
      <DitherEditor
        imageUrl={imageUrl}
        imageName={imageName}
        outputExt={outputExt}
        onCancel={onCancelDither}
        onSave={onSaveDither}
        onSaveCopy={onSaveCopyDither}
      />
    );
  }
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={imageUrl}
      alt="Uploaded"
      className="sm:max-h-[60vh] w-full rounded border border-neutral-200 object-contain"
    />
  );
}

