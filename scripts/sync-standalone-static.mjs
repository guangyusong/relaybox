import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";

const rootDir = process.cwd();
const sourceDir = path.join(rootDir, ".next", "static");
const standaloneNextDir = path.join(rootDir, ".next", "standalone", ".next");
const targetDir = path.join(standaloneNextDir, "static");

await mkdir(standaloneNextDir, { recursive: true });
await rm(targetDir, { recursive: true, force: true });
await cp(sourceDir, targetDir, { recursive: true });
