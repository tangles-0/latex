import { redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import {
  getAppSettings,
  getLatestPatchNote,
  getUserLastPatchNoteDismissed,
  isAdminUser,
  listAlbums,
} from "@/lib/metadata-store";
import { listMediaForUser } from "@/lib/media-store";
import GalleryTabs from "@/components/gallery-tabs";
import PatchNoteBanner from "@/components/patch-note-banner";
import PageHeader from "@/components/ui/page-header";
import TextLink from "@/components/ui/text-link";

export default async function GalleryPage({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string }>;
}) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) {
    redirect("/");
  }

  const [albums, media, isAdmin, latestPatchNote, dismissedAt, settings] = await Promise.all([
    listAlbums(userId),
    listMediaForUser(userId),
    isAdminUser(userId),
    getLatestPatchNote(),
    getUserLastPatchNoteDismissed(userId),
    getAppSettings(),
  ]);

  console.log("isAdmin", isAdmin);  
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const initialTab = resolvedSearchParams?.tab === "albums" ? "albums" : "files";
  const pageTitle = initialTab === "albums" ? "ur albums" : "ur gallery";
  const shouldShowPatchBanner =
    latestPatchNote &&
    (!dismissedAt || new Date(latestPatchNote.publishedAt).getTime() > new Date(dismissedAt).getTime());

  return (
    <main className="flex min-h-screen w-full flex-col gap-6 px-2 sm:px-6 py-2 sm:py-10 text-sm">
      <PageHeader
        title={pageTitle}
        subtitle={`${media.length} file${media.length === 1 ? "" : "s"} uploaded.`}
        backLink={{ href: "/", label: "cd .. (back 2 home)" }}
        actions={
          <div className="flex flex-wrap gap-3 text-sm text-neutral-500">
            <TextLink href="/upload" className="text-sm">
              upload
            </TextLink>
            {isAdmin ? (
              <TextLink href="/admin" className="text-sm">
                admin
              </TextLink>
            ) : null}
            <TextLink href="/signout" className="text-sm">
              sign out (u quitin?)
            </TextLink>
          </div>
        }
      />

      {shouldShowPatchBanner ? (
        <PatchNoteBanner
          publishedAt={latestPatchNote.publishedAt}
          firstLine={latestPatchNote.firstLine}
        />
      ) : null}

      <GalleryTabs
        initialTab={initialTab}
        albums={albums.map((album) => ({ id: album.id, name: album.name }))}
        media={media}
        resumableThresholdBytes={settings.resumableThresholdBytes}
        isAdmin={isAdmin}
      />
    </main>
  );
}

