import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  forwardRef,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Queue, Worker, type Job } from "bullmq";
import { getRequestUserId, runWithRequestUserAsync } from "../../common/request-user.store.js";
import { ProjectsService } from "./projects.service.js";

export const DELIVERABLES_QUEUE_NAME = "theforge-deliverables";

/** Tipos de job soportados por la cola. */
export type GenerateJobType =
  | "cascade"
  | "blueprint"
  | "api-contracts"
  | "logic-flows"
  | "tasks"
  | "infra"
  | "architecture"
  | "use-cases"
  | "user-stories";

export interface GenerateJobData {
  type: GenerateJobType;
  projectId: string;
  userId?: string;
  preview?: boolean;
  gapsFeedback?: string | null;
}

/** Estado público de un job para polling del frontend. */
export interface GenerateJobStatus {
  jobId: string;
  type: GenerateJobType | null;
  status: "queued" | "active" | "completed" | "failed" | "retrying" | "unknown";
  progress: number;
  result?: unknown;
  error?: string;
  attemptsMade: number;
  maxAttempts: number;
  createdAt: number;
  finishedAt?: number;
}

/**
 * Determina si un error es transitorio para loggear apropiadamente.
 * BullMQ ya maneja el retry via `backoff` en defaultJobOptions.
 */
function isTransientError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes("rate limit") ||
    msg.includes("429") ||
    msg.includes("500") ||
    msg.includes("502") ||
    msg.includes("503") ||
    msg.includes("ehostunreach") ||
    msg.includes("econnreset") ||
    msg.includes("econnrefused") ||
    msg.includes("enotfound") ||
    msg.includes("etimedout") ||
    msg.includes("socket hang up") ||
    msg.includes("api connection error")
  );
}

@Injectable()
export class DeliverablesQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DeliverablesQueueService.name);
  private queue: Queue | null = null;
  private worker: Worker | null = null;

  /** Intentos máximos por job (BullMQ reintenta automáticamente con backoff). */
  private readonly MAX_ATTEMPTS = 4;

  constructor(
    @Inject(forwardRef(() => ProjectsService))
    private readonly projects: ProjectsService,
  ) {}

  isEnabled(): boolean {
    return !!process.env.REDIS_URL?.trim();
  }

  async onModuleInit(): Promise<void> {
    const url = process.env.REDIS_URL?.trim();
    if (!url) {
      this.logger.log("BullMQ: sin REDIS_URL — generate-* endpoints siguen siendo HTTP síncronos");
      return;
    }
    this.queue = new Queue(DELIVERABLES_QUEUE_NAME, {
      connection: { url },
      defaultJobOptions: {
        removeOnComplete: { age: 3600, count: 100 },
        removeOnFail: { age: 86_400, count: 40 },
        attempts: this.MAX_ATTEMPTS,
        backoff: {
          type: "exponential",
          delay: 4_000, // 4s → 8s → 16s → 32s (4 intentos, ~60s hasta failure final)
        },
      },
    });
    this.worker = new Worker(
      DELIVERABLES_QUEUE_NAME,
      async (job: Job<GenerateJobData>) => {
        const { type, projectId, userId, preview, gapsFeedback } = job.data;
        return runWithRequestUserAsync(userId ?? "system", async () => {
          this.logger.log(
            `BullMQ worker: iniciando job ${job.id} type=${type} projectId=${projectId} attempt=${job.attemptsMade + 1}/${this.MAX_ATTEMPTS}`,
          );
          job.updateProgress(0);

          switch (type) {
            case "cascade":
              return this.projects.generateDeliverablesCascade(projectId, () => {
                job.updateProgress(1);
              });
            case "blueprint":
              if (preview) return this.projects.generateBlueprintPreview(projectId, gapsFeedback);
              return this.projects.generateBlueprint(projectId, gapsFeedback);
            case "api-contracts":
              if (preview) return this.projects.generateApiContractsPreview(projectId, gapsFeedback);
              return this.projects.generateApiContracts(projectId, gapsFeedback);
            case "logic-flows":
              return this.projects.generateLogicFlows(projectId, gapsFeedback);
            case "tasks":
              return this.projects.generateTasks(projectId);
            case "infra":
              if (preview) return this.projects.generateInfraPreview(projectId, gapsFeedback);
              return this.projects.generateInfra(projectId, gapsFeedback);
            case "architecture":
              if (preview) return this.projects.generateArchitecturePreview(projectId);
              return this.projects.generateArchitecture(projectId);
            case "use-cases":
              if (preview) return this.projects.generateUseCasesPreview(projectId);
              return this.projects.generateUseCases(projectId);
            case "user-stories":
              if (preview) return this.projects.generateUserStoriesPreview(projectId);
              return this.projects.generateUserStories(projectId);
            default:
              throw new Error(`Tipo de job desconocido: ${type}`);
          }
        });
      },
      {
        connection: { url },
        concurrency: 2,
      },
    );
    this.worker.on("failed", (job, err) => {
      const data = job?.data as GenerateJobData | undefined;
      const transient = isTransientError(err);
      this.logger.error(
        `BullMQ job ${job?.id} (${data?.type ?? "?"} projectId=${data?.projectId ?? "?"}) ` +
          `${transient ? "falló (transitorio, reintentando...)" : "falló definitivamente"}: ${err instanceof Error ? err.message : err}`,
      );
    });
    this.worker.on("completed", (job) => {
      const data = job.data as GenerateJobData | undefined;
      const elapsed = job.finishedOn && job.processedOn ? Math.round((job.finishedOn - job.processedOn) / 1000) : 0;
      this.logger.log(`BullMQ job ${job.id} (${data?.type ?? "?"}) completado en ${elapsed}s`);
    });
    this.logger.log(
      `BullMQ worker activo (${DELIVERABLES_QUEUE_NAME}), maxAttempts=${this.MAX_ATTEMPTS}, concurrency=2, backoff=exponential/4s`,
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
  }

  /** Encola cualquier tipo de job de generación. Retorna jobId. */
  async enqueue(data: GenerateJobData): Promise<string> {
    if (!this.queue) {
      throw new ServiceUnavailableException("Cola no disponible. Configure REDIS_URL o use modo síncrono.");
    }
    const userId = data.userId ?? getRequestUserId();
    const job = await this.queue.add(data.type, { ...data, userId });
    return String(job.id);
  }

  /** Devuelve el estado público de un job para polling del frontend. */
  async getJobStatus(jobId: string): Promise<GenerateJobStatus> {
    if (!this.queue) {
      return { jobId, type: null, status: "unknown", progress: 0, attemptsMade: 0, maxAttempts: this.MAX_ATTEMPTS, createdAt: 0 };
    }
    const job = await this.queue.getJob(jobId);
    if (!job) {
      return { jobId, type: null, status: "unknown", progress: 0, attemptsMade: 0, maxAttempts: this.MAX_ATTEMPTS, createdAt: 0 };
    }

    const data = job.data as GenerateJobData | undefined;
    const state = await job.getState();

    let status: GenerateJobStatus["status"];
    if (state === "completed") status = "completed";
    else if (state === "failed") {
      status = job.attemptsMade < (job.opts?.attempts ?? 1) ? "retrying" : "failed";
    } else if (state === "active") status = "active";
    else if (state === "delayed") status = "retrying";
    else if (state === "waiting" || state === "waiting-children") status = "queued";
    else status = "unknown";

    return {
      jobId,
      type: data?.type ?? null,
      status,
      progress: (job.progress as number) ?? 0,
      result: job.returnvalue ?? undefined,
      error: job.failedReason ?? undefined,
      attemptsMade: job.attemptsMade,
      maxAttempts: this.MAX_ATTEMPTS,
      createdAt: job.timestamp ?? Date.now(),
      finishedAt: job.finishedOn ?? undefined,
    };
  }
}
