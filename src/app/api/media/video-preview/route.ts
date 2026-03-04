import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth";
import { getMediaForUser, updateVideoPreviewForUser } from "@/lib/media-store";
import { generateVideoPreviewFromStoredMedia } from "@/lib/media-storage";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const payload = (await request.json()) as { mediaId?: string };
  const mediaId = payload.mediaId?.trim() ?? "";
  if (!mediaId) {
    return NextResponse.json({ error: "mediaId is required." }, { status: 400 });
  }

  const media = await getMediaForUser("video", mediaId, userId);
  if (!media) {
    return NextResponse.json({ error: "Video not found." }, { status: 404 });
  }

  try {
    await updateVideoPreviewForUser({
      userId,
      mediaId,
      previewStatus: "pending",
      previewError: null,
    });
    const generated = await generateVideoPreviewFromStoredMedia({
      baseName: media.baseName,
      ext: media.ext,
      uploadedAt: new Date(media.uploadedAt),
    });
    const updated = await updateVideoPreviewForUser({
      userId,
      mediaId,
      previewStatus: "ready",
      previewError: null,
      sizeSm: generated.sizeSm,
      sizeLg: generated.sizeLg,
      width: generated.width,
      height: generated.height,
    });
    return NextResponse.json({
      ok: true,
      previewStatus: updated?.previewStatus ?? "ready",
      sizeSm: generated.sizeSm,
      sizeLg: generated.sizeLg,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to generate video preview.";
    await updateVideoPreviewForUser({
      userId,
      mediaId,
      previewStatus: "failed",
      previewError: message,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
