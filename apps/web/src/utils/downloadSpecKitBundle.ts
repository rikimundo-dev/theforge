import JSZip from "jszip";
import {
  buildSpecKitBundleFiles,
  type SpecKitBundleFile,
  type SpecKitBundleInput,
} from "@theforge/shared-types";
import { apiFetch, API_BASE } from "./apiClient.js";

export type { SpecKitBundleInput };

/** Añade archivos del bundle spec-kit en la raíz del ZIP (rutas `.specify/`, `specs/`, etc.). */
export function addSpecKitBundleToZip(zip: JSZip, files: SpecKitBundleFile[]): void {
  for (const file of files) {
    zip.file(file.path, file.content, { createFolders: true });
  }
}

/**
 * Genera y descarga un ZIP con layout compatible con github/spec-kit.
 * @returns true si el ZIP contiene al menos un archivo
 */
export async function downloadSpecKitBundle(
  input: SpecKitBundleInput,
  projectName: string,
): Promise<boolean> {
  const files = buildSpecKitBundleFiles(input);
  if (files.length === 0) return false;

  const zip = new JSZip();
  addSpecKitBundleToZip(zip, files);

  const blob = await zip.generateAsync({ type: "blob" });
  const safeName = (projectName || "workshop").replace(/[^\w\u00C0-\u024F\-]/gi, "-").slice(0, 80);
  const zipName = `${safeName}-sdd-spec-kit.zip`;

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = zipName;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
  return true;
}

/** Descarga bundle desde API (incluye THEFORGE-DOC-CONSUMPTION-GUIDE del servidor). */
export async function downloadSpecKitBundleFromApi(
  projectId: string,
  projectName: string,
): Promise<boolean> {
  const r = await apiFetch(`${API_BASE}/projects/${projectId.trim()}/export/sdd-bundle`);
  if (!r.ok) return false;
  const data = (await r.json()) as { files: SpecKitBundleFile[] };
  if (!data.files?.length) return false;

  const zip = new JSZip();
  addSpecKitBundleToZip(zip, data.files);
  const blob = await zip.generateAsync({ type: "blob" });
  const safeName = (projectName || "workshop").replace(/[^\w\u00C0-\u024F\-]/gi, "-").slice(0, 80);
  const zipName = `${safeName}-sdd-spec-kit.zip`;

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = zipName;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
  return true;
}
