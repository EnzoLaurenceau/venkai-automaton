/**
 * Venkai social tools — AutomatonTool wrappers so the agent publishes its own work.
 * Category "conway" (external side effects), risk "caution".
 */

import type { AutomatonTool, ToolContext } from "../../types.js";
import { createPublishers, type PublishContent } from "../social/publisher.js";

export function createSocialTools(): AutomatonTool[] {
  return createPublishers().map((publisher) => ({
    name: `publish_${publisher.name}`,
    description: `Publish a short honest update about your work to ${publisher.name} (marketing is part of earning your existence). Keep claims factual.`,
    parameters: {
      type: "object",
      properties: {
        text: { type: "string", description: "The post text. Factual, no hype." },
        link: { type: "string", description: "Optional link (payment link, repo, demo)." },
        imageUrl: { type: "string", description: "Optional image URL (Instagram requires one)." },
      },
      required: ["text"],
    },
    riskLevel: "caution",
    category: "conway",
    execute: async (args: Record<string, unknown>, _context: ToolContext): Promise<string> => {
      const content: PublishContent = {
        text: String(args.text ?? ""),
        link: args.link ? String(args.link) : undefined,
        imageUrl: args.imageUrl ? String(args.imageUrl) : undefined,
      };
      const result = await publisher.publish(content);
      return `published to ${publisher.name}: ${result.id}${result.url ? ` (${result.url})` : ""}`;
    },
  }));
}
