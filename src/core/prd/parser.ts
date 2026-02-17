import { readFile } from "node:fs/promises";

export interface ParsedPrd {
  raw: string;
  sections: { title: string; content: string }[];
}

export async function parsePrd(path: string): Promise<ParsedPrd> {
  const raw = await readFile(path, "utf8");
  const lines = raw.split(/\r?\n/);
  const sections: { title: string; content: string }[] = [];

  let currentTitle = "ROOT";
  let bucket: string[] = [];

  for (const line of lines) {
    if (line.startsWith("## ")) {
      if (bucket.length > 0) {
        sections.push({
          title: currentTitle,
          content: bucket.join("\n").trim(),
        });
      }
      currentTitle = line.replace(/^##\s+/, "").trim();
      bucket = [];
      continue;
    }
    bucket.push(line);
  }

  if (bucket.length > 0) {
    sections.push({
      title: currentTitle,
      content: bucket.join("\n").trim(),
    });
  }

  return { raw, sections };
}
