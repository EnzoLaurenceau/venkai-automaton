/**
 * Venkai Skills Bridge — import Hermes skills (SKILL.md) into the automaton skills dir.
 * Both ecosystems use the same SKILL.md convention, so this normalizes frontmatter and copies.
 */

import fs from "node:fs";
import path from "node:path";
import { parseSkillMd } from "../../skills/format.js";

export interface ImportResult {
  imported: string[];
  skipped: Array<{ path: string; reason: string }>;
}

/** Import every SKILL.md found under sourceDir into destDir/<skill-name>/SKILL.md. */
export function importHermesSkills(sourceDir: string, destDir: string): ImportResult {
  const result: ImportResult = { imported: [], skipped: [] };
  if (!fs.existsSync(sourceDir)) return result;

  const walk = (dir: string): string[] => {
    const out: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) out.push(...walk(full));
      else if (entry.isFile() && entry.name.toLowerCase() === "skill.md") out.push(full);
    }
    return out;
  };

  for (const file of walk(sourceDir)) {
    const content = fs.readFileSync(file, "utf8");
    const skill = parseSkillMd(content, file, "git");
    if (!skill || !skill.name) {
      result.skipped.push({ path: file, reason: "unparseable SKILL.md" });
      continue;
    }
    const target = path.join(destDir, skill.name);
    fs.mkdirSync(target, { recursive: true });
    const frontmatter = [
      "---",
      `name: ${skill.name}`,
      `description: ${JSON.stringify(skill.description || "")}`,
      `auto-activate: ${skill.autoActivate}`,
      ...(skill.requires ? [`requires: ${JSON.stringify(skill.requires)}`] : []),
      "---",
      "",
    ].join("\n");
    fs.writeFileSync(path.join(target, "SKILL.md"), frontmatter + skill.instructions + "\n", "utf8");
    result.imported.push(skill.name);
  }
  return result;
}
