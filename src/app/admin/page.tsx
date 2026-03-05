import { redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { getAdminStats, isAdminUser } from "@/lib/metadata-store";
import PageHeader from "@/components/ui/page-header";
import TextLink from "@/components/ui/text-link";
import StatCard from "@/components/ui/stat-card";
import Panel from "@/components/ui/panel";

function formatBytes(value: number) {
  if (!value) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let index = 0;
  let size = value;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size.toFixed(1)} ${units[index]}`;
}

export default async function AdminHomePage() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) {
    redirect("/");
  }

  const isAdmin = await isAdminUser(userId);
  if (!isAdmin) {
    redirect("/gallery");
  }

  const stats = await getAdminStats();

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 px-6 py-10 text-sm">
      <PageHeader
        title="Admin"
        subtitle="Platform overview and controls."
        backLink={{ href: "/gallery", label: "back 2 gallery" }}
      >
        <div className="flex flex-wrap gap-3 text-sm text-neutral-500">
          <TextLink href="/admin/users" className="text-sm">
            Users
          </TextLink>
          <TextLink href="/admin/groups" className="text-sm">
            Groups
          </TextLink>
          <TextLink href="/admin/limits" className="text-sm">
            Limits
          </TextLink>
          <TextLink href="/admin/settings" className="text-sm">
            Settings
          </TextLink>
          <TextLink href="/admin/billing" className="text-sm">
            Billing
          </TextLink>
          <TextLink href="/admin/patch-notes" className="text-sm">
            Patch notes
          </TextLink>
          <TextLink href="/admin/database" className="text-sm">
            Database
          </TextLink>
        </div>
      </PageHeader>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total disk usage" value={formatBytes(stats.totalBytes)} />
        <StatCard label="Files" value={stats.imageCount} />
        <StatCard label="Users" value={stats.userCount} />
        <StatCard label="Uploads last 24h" value={stats.uploadsLast24h} />
        <StatCard label="Signups last 24h" value={stats.signupsLast24h} />
        <StatCard label="Signups last 30d" value={stats.signupsLast30d} />
        <StatCard label="Albums" value={stats.albumCount} />
        <StatCard label="Shared files" value={`${stats.sharedPercent}%`} />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Panel className="text-xs">
          <div className="text-neutral-500">Average file size</div>
          <div className="mt-2 text-lg font-semibold">{formatBytes(stats.averageFileSize)}</div>
        </Panel>
        <Panel>
          <div className="text-xs text-neutral-500">File types</div>
          <div className="mt-3 space-y-2 text-xs">
            {stats.filetypeBreakdown.length === 0 ? (
              <div className="text-neutral-500">No uploads yet.</div>
            ) : (
              stats.filetypeBreakdown.map((item) => (
                <div key={item.ext} className="flex items-center justify-between">
                  <span>.{item.ext}</span>
                  <span>{item.count}</span>
                </div>
              ))
            )}
          </div>
        </Panel>
      </section>
    </main>
  );
}

