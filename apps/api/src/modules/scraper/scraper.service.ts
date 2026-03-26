import { Injectable } from "@nestjs/common";
import * as cheerio from "cheerio";
import { TIMEOUT_MS, MAX_BODY_KB, SCRAPER_USER_AGENT } from "./constants.js";
import { htmlToMarkdown } from "./html-to-markdown.js";
import { assertPublicHttpUrl } from "./url-ssrf-guard.js";

export interface ScrapedPage {
  url: string;
  markdown: string;
  error?: string;
}

const MAX_BODY_BYTES = MAX_BODY_KB * 1024;

@Injectable()
export class ScraperService {
  /**
   * Descarga cada URL, extrae contenido con Cheerio y convierte a markdown.
   * Si una URL falla, devuelve { url, markdown: '', error } sin romper el flujo.
   */
  async scrapeUrls(urls: string[]): Promise<ScrapedPage[]> {
    const results: ScrapedPage[] = [];
    for (const url of urls) {
      try {
        const markdown = await this.fetchAndConvert(url);
        results.push({ url, markdown });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        results.push({ url, markdown: "", error: message });
      }
    }
    return results;
  }

  private async fetchAndConvert(url: string): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      await assertPublicHttpUrl(url);
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { "User-Agent": SCRAPER_USER_AGENT },
        redirect: "follow",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const contentType = res.headers.get("content-type") ?? "";
      if (!contentType.includes("text/html") && !contentType.includes("text/plain")) {
        throw new Error("Unsupported content-type");
      }
      const reader = res.body;
      if (!reader) throw new Error("No body");
      const chunks: Uint8Array[] = [];
      let total = 0;
      for await (const chunk of reader as AsyncIterable<Uint8Array>) {
        total += chunk.length;
        if (total > MAX_BODY_BYTES) break;
        chunks.push(chunk);
      }
      clearTimeout(timeout);
      const buffer = Buffer.concat(chunks);
      const html = buffer.toString("utf-8");
      return this.extractAndToMarkdown(html);
    } finally {
      clearTimeout(timeout);
    }
  }

  private extractAndToMarkdown(html: string): string {
    const $ = cheerio.load(html);
    $("script, style, nav").remove();
    const root =
      $("article").length > 0
        ? $("body").find("article").first()
        : $("main").length > 0
          ? $("main").first()
          : $("body");
    const fragment = $.html(root);
    return htmlToMarkdown(fragment).trim();
  }
}
