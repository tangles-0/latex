import type { ComponentType } from "react";
import { LightFileImage } from '@energiz3r/icon-library/Icons/Light/LightFileImage';
import { LightFileVideo } from '@energiz3r/icon-library/Icons/Light/LightFileVideo';
import { LightFileAudio } from '@energiz3r/icon-library/Icons/Light/LightFileAudio';
import { LightFileArchive } from "@energiz3r/icon-library/Icons/Light/LightFileArchive";
import { LightFilePdf } from "@energiz3r/icon-library/Icons/Light/LightFilePdf";
import { LightFileAlt } from '@energiz3r/icon-library/Icons/Light/LightFileAlt';
import { LightFileSpreadsheet } from '@energiz3r/icon-library/Icons/Light/LightFileSpreadsheet';
import { LightFileChartPie } from '@energiz3r/icon-library/Icons/Light/LightFileChartPie';
import { LightFileCsv } from '@energiz3r/icon-library/Icons/Light/LightFileCsv';
import { LightFileCode } from '@energiz3r/icon-library/Icons/Light/LightFileCode';
import { LightFile } from '@energiz3r/icon-library/Icons/Light/LightFile';
import {
  ARCHIVE_EXTENSIONS,
  AUDIO_EXTENSIONS,
  CODE_EXTENSIONS,
  CSV_EXTENSIONS,
  DOCUMENT_TEXT_EXTENSIONS,
  IMAGE_EXTENSIONS,
  PDF_EXTENSIONS,
  PRESENTATION_EXTENSIONS,
  SPREADSHEET_EXTENSIONS,
  VIDEO_EXTENSIONS,
} from "@/lib/media-types";

type IconComponent = ComponentType<{ className?: string; fill?: string }>;

function normalizeExt(ext?: string): string {
  return (ext ?? "").toLowerCase().replace(/^\./, "");
}

export function isAudioExtension(ext?: string): boolean {
  return AUDIO_EXTENSIONS.has(normalizeExt(ext));
}

export function getFileIconForExtension(ext?: string): IconComponent {
  const normalized = normalizeExt(ext);

  if (IMAGE_EXTENSIONS.has(normalized)) return LightFileImage;
  if (VIDEO_EXTENSIONS.has(normalized)) return LightFileVideo;
  if (AUDIO_EXTENSIONS.has(normalized)) return LightFileAudio;
  if (ARCHIVE_EXTENSIONS.has(normalized)) return LightFileArchive;
  if (PDF_EXTENSIONS.has(normalized)) return LightFilePdf;
  if (CSV_EXTENSIONS.has(normalized)) return LightFileCsv;
  if (SPREADSHEET_EXTENSIONS.has(normalized)) return LightFileSpreadsheet;
  if (PRESENTATION_EXTENSIONS.has(normalized)) return LightFileChartPie;
  if (CODE_EXTENSIONS.has(normalized)) return LightFileCode;
  if (DOCUMENT_TEXT_EXTENSIONS.has(normalized)) return LightFileAlt;
  return LightFile;
}

export function renderFileIconForExtension(
  ext?: string,
  props?: { className?: string; fill?: string },
): React.ReactNode {
  const normalized = normalizeExt(ext);

  if (IMAGE_EXTENSIONS.has(normalized)) return <LightFileImage {...props} />;
  if (VIDEO_EXTENSIONS.has(normalized)) return <LightFileVideo {...props} />;
  if (AUDIO_EXTENSIONS.has(normalized)) return <LightFileAudio {...props} />;
  if (ARCHIVE_EXTENSIONS.has(normalized)) return <LightFileArchive {...props} />;
  if (PDF_EXTENSIONS.has(normalized)) return <LightFilePdf {...props} />;
  if (CSV_EXTENSIONS.has(normalized)) return <LightFileCsv {...props} />;
  if (SPREADSHEET_EXTENSIONS.has(normalized)) return <LightFileSpreadsheet {...props} />;
  if (PRESENTATION_EXTENSIONS.has(normalized)) return <LightFileChartPie {...props} />;
  if (CODE_EXTENSIONS.has(normalized)) return <LightFileCode {...props} />;
  if (DOCUMENT_TEXT_EXTENSIONS.has(normalized)) return <LightFileAlt {...props} />;
  return <LightFile {...props} />;
}
