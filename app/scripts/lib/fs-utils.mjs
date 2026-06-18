import { promises as fs } from "node:fs";
import path from "node:path";

export async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

export async function copyDir(from, to, filter = () => true) {
  if (!(await exists(from))) return;

  await ensureDir(to);
  const entries = await fs.readdir(from, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name === ".DS_Store") continue;

    const source = path.join(from, entry.name);
    const target = path.join(to, entry.name);

    if (!filter(source, entry)) continue;

    if (entry.isDirectory()) {
      await copyDir(source, target, filter);
      continue;
    }

    if (entry.isFile()) {
      await ensureDir(path.dirname(target));
      await fs.copyFile(source, target);
    }
  }
}

export async function listFiles(root, predicate = () => true) {
  if (!(await exists(root))) return [];

  const result = [];
  const entries = await fs.readdir(root, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name === ".DS_Store") continue;

    const fullPath = path.join(root, entry.name);

    if (entry.isDirectory()) {
      result.push(...await listFiles(fullPath, predicate));
      continue;
    }

    if (entry.isFile() && predicate(fullPath)) {
      result.push(fullPath);
    }
  }

  return result.sort((a, b) => a.localeCompare(b));
}

export function toPosixPath(filePath) {
  return filePath.split(path.sep).join("/");
}

export function pageRouteFromRelative(relativePath) {
  const posixPath = toPosixPath(relativePath);

  if (posixPath === "index.html") return "/";
  if (posixPath.endsWith("/index.html")) {
    return `/${posixPath.slice(0, -"index.html".length)}`;
  }

  return `/${posixPath.replace(/\.html$/i, "")}`;
}
