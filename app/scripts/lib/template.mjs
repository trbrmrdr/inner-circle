import { promises as fs } from "node:fs";
import path from "node:path";

export function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export async function renderTemplate(source, context, options) {
  const withPartials = await renderPartials(source, context, options);
  return renderVariables(withPartials, context);
}

async function renderPartials(source, context, options) {
  const includePattern = /{{>\s*([^}\s]+)\s*}}/g;
  let result = "";
  let cursor = 0;

  for (const match of source.matchAll(includePattern)) {
    result += source.slice(cursor, match.index);

    const partialPath = path.join(options.partialsRoot, match[1]);
    const partial = await fs.readFile(partialPath, "utf8");
    result += await renderTemplate(partial, context, options);
    cursor = match.index + match[0].length;
  }

  result += source.slice(cursor);
  return result;
}

function renderVariables(source, context) {
  return source.replace(/{{\s*([A-Z0-9_]+)\s*}}/g, (_, key) => {
    return context[key] ?? "";
  });
}
