import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";

/**
 * Crea y mantiene el PostgresSaver para LangGraph.
 * Llama a setup() en el primer uso para crear las tablas de checkpoints en Postgres.
 */
@Injectable()
export class CheckpointerService implements OnModuleInit {
  private readonly logger = new Logger(CheckpointerService.name);

  private checkpointer: PostgresSaver | null = null;
  private setupPromise: Promise<void> | null = null;

  async onModuleInit(): Promise<void> {
    await this.getCheckpointer();
  }

  /**
   * Devuelve el checkpointer; si no existe, lo crea desde DATABASE_URL y ejecuta setup().
   */
  async getCheckpointer(): Promise<PostgresSaver | null> {
    const url = process.env.DATABASE_URL;
    if (!url?.trim()) {
      return null;
    }
    if (this.checkpointer) {
      return this.checkpointer;
    }
    if (this.setupPromise) {
      await this.setupPromise;
      return this.checkpointer;
    }
    this.setupPromise = this.initCheckpointer(url);
    await this.setupPromise;
    this.setupPromise = null;
    return this.checkpointer;
  }

  private async initCheckpointer(connString: string): Promise<void> {
    const saver = PostgresSaver.fromConnString(connString.trim(), {
      schema: "public",
    });
    try {
      await saver.setup();
      this.logger.log("LangGraph PostgresSaver: setup() completed (checkpoints tables).");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `LangGraph PostgresSaver setup() failed — DBGA / Paso 0 need tables checkpoints, checkpoint_blobs, checkpoint_writes. Run DB migrations (e.g. prisma migrate deploy). ${message}`,
      );
      throw err;
    }
    this.checkpointer = saver;
  }
}
