import { tool } from "@langchain/core/tools";
import * as cheerio from "cheerio";
import { z } from "zod";
import { htmlToMarkdown } from "../../scraper/html-to-markdown.js";
import { TIMEOUT_MS, SCRAPER_USER_AGENT } from "../../scraper/constants.js";
import { assertPublicHttpUrl } from "../../scraper/url-ssrf-guard.js";

const MARKDOWN_SNIPPET_LENGTH = 4000;
const MAX_BODY_BYTES = 512 * 1024;

/**
 * Scrape a URL with fetch + Cheerio. Returns metadata (title, description) and markdown snippet.
 * Used by Scout and Auditor; no API key required.
 */
export const createScrapeUrlTool = () =>
  tool(
    async ({ url }: { url: string }) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
      try {
        await assertPublicHttpUrl(url);
        const res = await fetch(url, {
          signal: controller.signal,
          headers: { "User-Agent": SCRAPER_USER_AGENT },
          redirect: "follow",
        });
        if (!res.ok) {
          return JSON.stringify({ error: `HTTP ${res.status}`, url });
        }
        const contentType = res.headers.get("content-type") ?? "";
        if (!contentType.includes("text/html") && !contentType.includes("text/plain")) {
          return JSON.stringify({ error: "Unsupported content-type", url });
        }
        const reader = res.body;
        if (!reader) return JSON.stringify({ error: "No body", url });
        const chunks: Uint8Array[] = [];
        let total = 0;
        for await (const chunk of reader as AsyncIterable<Uint8Array>) {
          total += chunk.length;
          if (total > MAX_BODY_BYTES) break;
          chunks.push(chunk);
        }
        clearTimeout(timeout);
        const html = Buffer.concat(chunks).toString("utf-8");
        const $ = cheerio.load(html);
        $("script, style, nav").remove();
        const title =
          $('meta[property="og:title"]').attr("content")?.trim() ??
          $("title").text()?.trim() ??
          "";
        const description =
          $('meta[property="og:description"]').attr("content")?.trim() ??
          $('meta[name="description"]').attr("content")?.trim() ??
          "";
        const root =
          $("article").length > 0
            ? $("body").find("article").first()
            : $("main").length > 0
              ? $("main").first()
              : $("body");
        const fragment = $.html(root);
        const markdown = htmlToMarkdown(fragment).trim();
        const snippet =
          markdown.length > MARKDOWN_SNIPPET_LENGTH
            ? markdown.slice(0, MARKDOWN_SNIPPET_LENGTH) + "\n...[truncated]"
            : markdown;
        return JSON.stringify({
          url,
          metadata: { title, description },
          markdownSnippet: snippet,
        });
      } catch (err) {
        clearTimeout(timeout);
        const message = err instanceof Error ? err.message : String(err);
        return JSON.stringify({ error: message, url });
      }
    },
    {
      name: "scrape_url",
      description:
        "Scrape a URL to get page content (markdown) and metadata (title, description). Use for competitor pages or to infer tech stack from page content.",
      schema: z.object({
        url: z.string().url().describe("The URL to scrape (e.g. competitor homepage or docs)."),
      }),
    }
  );
