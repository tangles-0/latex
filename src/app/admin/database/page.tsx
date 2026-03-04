import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { isAdminUser } from "@/lib/metadata-store";
import AdminDatabase from "@/components/admin-database";

export default async function AdminDatabasePage() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) {
    redirect("/");
  }

  const isAdmin = await isAdminUser(userId);
  if (!isAdmin) {
    redirect("/gallery");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 px-6 py-10 text-sm">
      <header className="space-y-2">
        <Link href="/admin" className="text-sm text-neutral-500 underline">
          Back to admin
        </Link>
        <h1 className="text-2xl font-semibold">Database Maintenance</h1>
        <p className="text-neutral-600">Database import, export, and migration helpers.</p>
      </header>

      <AdminDatabase />
    </main>
  );
}
