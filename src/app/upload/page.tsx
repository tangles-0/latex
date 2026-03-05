import { redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { getAppSettings } from "@/lib/metadata-store";
import UploadDropzone from "@/components/upload-dropzone";
import AlertBanner from "@/components/ui/alert-banner";
import PageHeader from "@/components/ui/page-header";

export default async function UploadPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/");
  }

  const settings = await getAppSettings();

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-6 py-10 text-sm">
      <PageHeader
        title="Upload files"
        subtitle={`Logged in as ${session.user.email ?? "user"}.`}
        backLink={{ href: "/gallery", label: "back 2 gallery" }}
      />

      {!settings.uploadsEnabled ? (
        <AlertBanner>Uploads are currently disabled by the administrator.</AlertBanner>
      ) : null}

      <UploadDropzone
        uploadsEnabled={settings.uploadsEnabled}
        resumableThresholdBytes={settings.resumableThresholdBytes}
      />

      
    </main>
  );
}

