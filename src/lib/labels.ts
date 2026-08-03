import { readFile, writeFile, mkdir } from "fs/promises";
import { join } from "path";

const DATA_DIR = join(
  /* turbopackIgnore: true */ process.cwd(),
  process.env.APP_DATA_DIR ?? ".data"
);
const LABELS_FILE = join(DATA_DIR, "labels.json");

export type Labels = Record<string, string>;

export async function getLabels(): Promise<Labels> {
  try {
    const raw = await readFile(LABELS_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export async function setLabel(id: string, label: string): Promise<Labels> {
  await mkdir(DATA_DIR, { recursive: true });
  const labels = await getLabels();
  if (label.trim()) {
    labels[id] = label.trim();
  } else {
    delete labels[id];
  }
  await writeFile(LABELS_FILE, JSON.stringify(labels, null, 2));
  return labels;
}
