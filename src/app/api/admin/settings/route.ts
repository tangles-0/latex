import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth";
import { getAppSettings, isAdminUser, updateAppSettings } from "@/lib/metadata-store";

export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const isAdmin = await isAdminUser(userId);
  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const settings = await getAppSettings();
  return NextResponse.json({ settings });
}

export async function POST(request: Request): Promise<NextResponse> {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const isAdmin = await isAdminUser(userId);
  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const payload = (await request.json()) as {
    motd?: string;
    costThisMonth?: number;
    fundedThisMonth?: number;
    donateUrl?: string | null;
    supportEnabled?: boolean;
    signupsEnabled?: boolean;
    uploadsEnabled?: boolean;
    shareHtmlNavigationEnabled?: boolean;
    resumableThresholdBytes?: number;
  };

  const motd = payload.motd?.trim();
  const costThisMonth = payload.costThisMonth;
  const fundedThisMonth = payload.fundedThisMonth;
  const donateUrl = payload.donateUrl?.trim() || null;

  if (typeof costThisMonth === "number" && costThisMonth < 0) {
    return NextResponse.json({ error: "Cost must be >= 0." }, { status: 400 });
  }
  if (typeof fundedThisMonth === "number" && fundedThisMonth < 0) {
    return NextResponse.json({ error: "Funded must be >= 0." }, { status: 400 });
  }

  if (donateUrl && !/^https?:\/\//i.test(donateUrl)) {
    return NextResponse.json({ error: "Donate URL must be http(s)." }, { status: 400 });
  }
  if (
    typeof payload.resumableThresholdBytes === "number" &&
    (!Number.isFinite(payload.resumableThresholdBytes) || payload.resumableThresholdBytes < 1024 * 1024)
  ) {
    return NextResponse.json(
      { error: "Resumable threshold must be at least 1MB." },
      { status: 400 },
    );
  }

  const settings = await updateAppSettings({
    motd,
    costThisMonth,
    fundedThisMonth,
    donateUrl,
    supportEnabled: payload.supportEnabled,
    signupsEnabled: payload.signupsEnabled,
    uploadsEnabled: payload.uploadsEnabled,
    shareHtmlNavigationEnabled: payload.shareHtmlNavigationEnabled,
    resumableThresholdBytes: payload.resumableThresholdBytes,
  });

  return NextResponse.json({ settings });
}

