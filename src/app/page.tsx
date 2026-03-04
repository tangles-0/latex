import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { getAppSettings, getLatestPatchNote, getUserUploadStats } from "@/lib/metadata-store";
import AuthForms from "@/components/auth-forms";
import AlertBanner from "@/components/ui/alert-banner";
import TextLink from "@/components/ui/text-link";
import { BrandsGithub } from '@energiz3r/icon-library/Icons/Brands/BrandsGithub';
import Link from "next/link";
import PatchNoteMarkdown from "@/components/patch-note-markdown";

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let next = value;
  let unitIndex = -1;
  while (next >= 1024 && unitIndex < units.length - 1) {
    next /= 1024;
    unitIndex += 1;
  }
  return `${next.toFixed(next < 10 ? 1 : 0)} ${units[unitIndex]}`;
}

export default async function Home() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;

  const settings = await getAppSettings();
  const funded = settings.fundedThisMonth;
  const cost = settings.costThisMonth;
  const progress = cost > 0 ? Math.min(100, Math.round((funded / cost) * 100)) : 0;
  const userStats = userId ? await getUserUploadStats(userId) : null;
  const latestPatchNote = await getLatestPatchNote();

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-4 px-6 py-2 sm:py-10 text-sm">
      <header className="space-y-2">
        <div className="relative">
          <h1 className="text-2xl font-semibold mt-1">latex <span className="font-medium text-neutral-500">img_srv</span></h1>
          <div className="absolute top-[-15px] left-[-22px]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/latex-logo.png" alt="latex" width="32px" className="latex-logo z-5" />
          </div>
        </div>
        <p className="text-neutral-600">
          create acct to upload imgs, mkdir albums, and create symlinks to send to frendz/foez
        </p>
      </header>

      {/* <section className="rounded-md border border-neutral-200 px-4 py-2 text-sm relative">
        <h2 className="text-lg font-medium">motd</h2>
        <p className="mt-2 text-xs text-neutral-600">{settings.motd}</p>
      </section> */}

      <section className="rounded-md border border-neutral-200 p-4 text-sm relative">
      <div className="sm:absolute relative top-0 right-0 flex">
          <div className="flex items-center gap-2">
            {latestPatchNote ? (
              <p className="text-xs text-neutral-500">
                {new Date(latestPatchNote.publishedAt).toLocaleString()}
              </p>
            ) : null}
            |
            <TextLink href="/patch-notes" className="text-xs">
              view all
            </TextLink>
            |
          </div>
          <Link
            href="https://github.com/tangles-0/latex"
            target="_blank"
            rel="noopener noreferrer"

          >
            <BrandsGithub className="p-2 h-10 w-10" fill="currentColor" />
          </Link>
        </div>
        <h2 className="text-lg font-medium">latest update</h2>
        {latestPatchNote ? (
          <div className="mt-0 space-y-2">
            <div className="text-sm">
              <PatchNoteMarkdown content={latestPatchNote.content} />
            </div>
          </div>
        ) : (
          <p className="mt-2 text-xs text-neutral-500">No patch notes published yet.</p>
        )}
      </section>

      {userId ? (
        <section className="space-y-2 rounded-md border border-neutral-200 p-4 text-sm">
          {/* <h2 className="text-lg font-medium">I C U AGAIN</h2> 
          <p className="text-lg text-neutral-600">*/}
          <h2 className="text-lg font-medium">
            u r <span className="font-bold">{session?.user?.name ?? session?.user?.email ?? "...who r u?"}</span>. wb &lt;3
          </h2>
          <p className="text-xs text-neutral-600">
            u hav {userStats?.imageCount ?? 0} imgs uploaded using{" "}
            {formatBytes(userStats?.totalBytes ?? 0)} of spinning rust
          </p>
          <TextLink
            href="/gallery"
            variant="loud"
            className="inline-flex items-center gap-1 text-lg font-medium"
          >
            clk here 2 go 2 ur gallery <span aria-hidden="true">&gt;</span>
          </TextLink>
        </section>
      ) : (
        <>
          {!settings.signupsEnabled ? (
            <AlertBanner>
              New signups are currently disabled. Existing users can still log in.
            </AlertBanner>
          ) : null}

          <AuthForms signupsEnabled={settings.signupsEnabled} />
        </>
      )}

      {settings.supportEnabled ? (
        <section className="space-y-3 rounded-md border border-neutral-200 p-4">
          <h2 className="text-lg font-medium">Support this thing</h2>
          <p className="text-xs text-neutral-600">
            This site is developed and maintained by a single dev. If you found it useful, please
            consider supporting it :)
          </p>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-neutral-500">
              <span>
                ${funded} / ${cost} funded this month
              </span>
              <span>{progress}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded bg-neutral-200">
              <div
                className="h-full bg-emerald-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
          {settings.donateUrl ? (
            <a
              href={settings.donateUrl}
              className="inline-flex rounded border border-emerald-500 px-4 py-2 text-xs text-emerald-600"
            >
              Donate
            </a>
          ) : (
            <button
              type="button"
              disabled
              className="cursor-not-allowed rounded border border-neutral-300 px-4 py-2 text-xs text-neutral-400"
            >
              Donate
            </button>
          )}
        </section>
      ) : null}

      <section className="space-y-2 rounded-md border border-neutral-200 p-4">
        <h2 className="text-lg font-medium"><span className="text-emerald-500 animate-pulse">pro tip:</span> thumbnail links</h2>
        <p className="text-xs text-neutral-600">
          create a share link, then append <code>-sm</code> or <code>-lg</code> before the file
          extension for thumbnails.
        </p>
        <p className="text-neutral-500 text-xs">
          eg: <code>/share/&lt;file&gt;.png</code>{" "} becomes {" "}
          <code>/share/&lt;file&gt;-sm.png</code>
        </p>
      </section>
    </main>
  );
}

