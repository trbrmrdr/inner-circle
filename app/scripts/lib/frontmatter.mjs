export function parseFrontmatter(source) {
  if (!source.startsWith("---\n")) {
    return { data: {}, content: source };
  }

  const end = source.indexOf("\n---", 4);

  if (end === -1) {
    return { data: {}, content: source };
  }

  const raw = source.slice(4, end);
  const content = source.slice(end + 4).replace(/^\n/, "");
  const data = {};

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separator = trimmed.indexOf(":");
    if (separator === -1) continue;

    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim();
    data[key] = value;
  }

  return { data, content };
}
