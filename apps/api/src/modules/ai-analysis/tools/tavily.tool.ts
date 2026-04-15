import type { StructuredToolInterface } from "@langchain/core/tools";
import { tool } from "@langchain/core/tools";
import { TavilySearch } from "@langchain/tavily";
import { z } from "zod";

const tavilySchema = z.object({
  query: z.string().describe("Search query (e.g. competitors for X, pricing of Y)."),
});

/**
 * Tavily search tool for the Scout agent.
 * Wrapped with a single-argument schema (query) so OpenAI tool calls don't fail
 * with "Received tool input did not match expected schema" (Tavily's schema uses
 * .optional() which the API doesn't support; we use only required fields).
 *
 * Sin `TAVILY_API_KEY` no instanciamos el SDK (lanza al construir). Devolvemos un stub
 * para que el grafo DBGA arranque; Scout puede seguir usando `scrape_url`.
 */
export function createTavilySearchTool(): StructuredToolInterface {
  const key = (process.env.TAVILY_API_KEY ?? "").trim();
  if (!key) {
    return tool(
      async () =>
        JSON.stringify({
          error: "Tavily not configured",
          hint: "Set TAVILY_API_KEY on the API service (e.g. docker-compose environment + Dokploy secrets).",
        }),
      {
        name: "tavily_search",
        description:
          "Web search (unavailable: TAVILY_API_KEY missing). Prefer scrape_url for known URLs.",
        schema: tavilySchema,
      },
    );
  }

  const tavily = new TavilySearch({
    maxResults: 5,
    searchDepth: "basic",
    includeAnswer: false,
    includeRawContent: false,
    tavilyApiKey: key,
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
      schema: tavilySchema,
    },
  );
}
