import { Controller, Get, Put, Post, Body, Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service.js";

@Controller("admin")
export class AdminController {
  private readonly logger = new Logger(AdminController.name);

  constructor(private readonly prisma: PrismaService) {}

  @Get("ariadne-config")
  async getAriadneConfig(): Promise<{ url: string; token: string }> {
    const rows = await this.prisma.appConfig.findMany({
      where: { key: { in: ["ariadne_mcp_url", "ariadne_mcp_token"] } },
    });
    const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    return {
      url: map.ariadne_mcp_url ?? "",
      token: map.ariadne_mcp_token ?? "",
    };
  }

  @Put("ariadne-config")
  async setAriadneConfig(
    @Body() body: { url?: string; token?: string },
  ): Promise<{ ok: boolean }> {
    const upsert = async (key: string, value: string | undefined) => {
      if (value === undefined) return;
      await this.prisma.appConfig.upsert({
        where: { key },
        create: { key, value },
        update: { value },
      });
    };
    await upsert("ariadne_mcp_url", typeof body.url === "string" ? body.url.trim() : undefined);
    await upsert("ariadne_mcp_token", typeof body.token === "string" ? body.token.trim() : undefined);
    this.logger.log(`[Admin] Ariadne config updated`);
    return { ok: true };
  }

  @Post("ariadne-config/test")
  async testAriadneConnection(
    @Body() body: { url: string; token: string },
  ): Promise<{ ok: boolean; error?: string }> {
    const { url, token } = body;
    if (!url) return { ok: false, error: "URL es requerida" };
    if (!token) return { ok: false, error: "Token es requerido" };
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          "MCP-Protocol-Version": "2025-03-26",
          "X-M2M-Token": token,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "test-1",
          method: "tools/list",
          params: {},
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) {
        const text = await response.text().catch(() => "sin cuerpo");
        return { ok: false, error: `HTTP ${response.status}: ${text.slice(0, 200)}` };
      }
      const raw = await response.text();
      // Intentar parsear como JSON-RPC directo
      let data: Record<string, unknown> | null = null;
      try {
        data = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        // Podría ser SSE (Streamable HTTP) — extraer JSON entre bloques
        const lines = raw.split("\n");
        const jsonBlocks: string[] = [];
        let buf = "";
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            buf = line.slice(6).trim();
          } else if (line.trim() === "" && buf) {
            jsonBlocks.push(buf);
            buf = "";
          }
        }
        if (buf) jsonBlocks.push(buf);
        for (const block of jsonBlocks) {
          try {
            data = JSON.parse(block) as Record<string, unknown>;
            break;
          } catch {
            continue;
          }
        }
      }
      if (!data) {
        return { ok: false, error: `Respuesta inesperada (${raw.slice(0, 200)})` };
      }
      if (data.error) {
        return {
          ok: false,
          error: typeof data.error === "object" ? JSON.stringify(data.error) : String(data.error),
        };
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Error de conexión" };
    }
  }
}
