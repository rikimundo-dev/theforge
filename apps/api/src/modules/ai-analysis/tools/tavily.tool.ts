import { tool } from "@langchain/core/tools";
import { TavilySearch } from "@langchain/tavily";
import { z } from "zod";

const TAVILY_API_KEY = process.env.TAVILY_API_KEY ?? "";

/**
 * Tavily search tool for the Scout agent.
 * Wrapped with a single-argument schema (query) so OpenAI tool calls don't fail
 * with "Received tool input did not match expected schema" (Tavily's schema uses
 * .optional() which the API doesn't support; we use only required fields).
 */
export function createTavilySearchTool() {
  const tavily = new TavilySearch({
    maxResults: 5,
    searchDepth: "advanced",
    includeAnswer: false,
    includeRawContent: false,
    tavilyApiKey: TAVILY_API_KEY || undefined,
  });

  return tool(
    async ({ query }: { query: string }) => {
      const result = await tavily.invoke({ query });
      return typeof result === "string" ? result : JSON.stringify(result);
    },
    {
      name: "tavily_search",
      description:
        "Search the web for competitors, market info, or product references. Use for finding direct competitors and verified URLs.",
      schema: z.object({
        query: z.string().describe("Search query (e.g. competitors for X, pricing of Y)."),
      }),
    },
  );
}
