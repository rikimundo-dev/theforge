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
import { LegacyCoordinatorService } from "./legacy-coordinator.service.js";

export const LEGACY_DELIVERABLES_QUEUE_NAME = "theforge-legacy-deliverables";

export interface LegacyDeliverablesJobData {
  projectId: string;
  stageId?: string;
  userId?: string;
}

export interface LegacyDeliverablesJobStatus {
  jobId: string;
  projectId?: string;
  status: "queued" | "active" | "completed" | "failed" | "retrying" | "unknown";
  progress: unknown;
  result?: unknown;
  error?: string;
  attemptsMade: number;
  maxAttempts: number;
  createdAt: number;
  finishedAt?: number;
}

@Injectable()
export class LegacyDeliverablesQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LegacyDeliverablesQueueService.name);
  private queue: Queue | null = null;
  private worker: Worker | null = null;
  private readonly MAX_ATTEMPTS = 4;

  constructor(
    @Inject(forwardRef(() => LegacyCoordinatorService))
    private readonly coordinator: LegacyCoordinatorService,
  ) {}

  isEnabled(): boolean {
    return !!process.env.REDIS_URL?.trim();
  }

  async onModuleInit(): Promise<void> {
    const url = process.env.REDIS_URL?.trim();
    if (!url) {
      this.logger.log("BullMQ legacy: sin REDIS_URL — POST …/legacy/generate-deliverables sigue siendo HTTP síncrono");
      return;
    }

    this.queue = new Queue(LEGACY_DELIVERABLES_QUEUE_NAME, {
      connection: { url },
      defaultJobOptions: {
        removeOnComplete: { age: 3600, count: 100 },
        removeOnFail: { age: 86_400, count: 40 },
        attempts: this.MAX_ATTEMPTS,
        backoff: { type: "exponential", delay: 4_000 },
      },
    });

    this.worker = new Worker(
      LEGACY_DELIVERABLES_QUEUE_NAME,
      async (job: Job<LegacyDeliverablesJobData>) => {
        const { projectId, stageId, userId } = job.data;
        return runWithRequestUserAsync(userId ?? "system", async () => {
          this.logger.log(
            `BullMQ legacy worker: job ${job.id} projectId=${projectId} attempt=${job.attemptsMade + 1}/${this.MAX_ATTEMPTS}`,
          );
          job.updateProgress({ phase: "legacy_deliverables", step: "preflight", index: 0, total: 1 });
          return this.coordinator.generateDeliverables(projectId, stageId, {
            onProgress: (p) => job.updateProgress({ phase: "legacy_deliverables", ...p }),
          });
        });
      },
      { connection: { url }, concurrency: 1 },
    );

    this.worker.on("failed", (job, err) => {
      const data = job?.data as LegacyDeliverablesJobData | undefined;
      this.logger.error(
        `BullMQ legacy job ${job?.id} (projectId=${data?.projectId ?? "?"}) falló: ${err instanceof Error ? err.message : err}`,
      );
    });
    this.worker.on("completed", (job) => {
      const elapsed =
        job.finishedOn && job.processedOn ? Math.round((job.finishedOn - job.processedOn) / 1000) : 0;
      this.logger.log(`BullMQ legacy job ${job.id} completado en ${elapsed}s`);
    });
    this.logger.log(`BullMQ legacy worker activo (${LEGACY_DELIVERABLES_QUEUE_NAME}), concurrency=1`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
  }

  async enqueue(data: LegacyDeliverablesJobData): Promise<string> {
    if (!this.queue) {
      throw new ServiceUnavailableException("Cola legacy no disponible. Configure REDIS_URL.");
    }
    const userId = data.userId ?? getRequestUserId();
    const job = await this.queue.add("legacy-cascade", { ...data, userId });
    return String(job.id);
  }

  async getJobStatus(jobId: string): Promise<LegacyDeliverablesJobStatus> {
    if (!this.queue) {
      return {
        jobId,
        status: "unknown",
        progress: 0,
        attemptsMade: 0,
        maxAttempts: this.MAX_ATTEMPTS,
        createdAt: 0,
      };
    }
    const job = await this.queue.getJob(jobId);
    if (!job) {
      return {
        jobId,
        status: "unknown",
        progress: 0,
        attemptsMade: 0,
        maxAttempts: this.MAX_ATTEMPTS,
        createdAt: 0,
      };
    }

    const data = job.data as LegacyDeliverablesJobData | undefined;
    const state = await job.getState();
    let status: LegacyDeliverablesJobStatus["status"];
    if (state === "completed") status = "completed";
    else if (state === "failed") {
      status = job.attemptsMade < (job.opts?.attempts ?? 1) ? "retrying" : "failed";
    } else if (state === "active") status = "active";
    else if (state === "delayed") status = "retrying";
    else if (state === "waiting" || state === "waiting-children") status = "queued";
    else status = "unknown";

    return {
      jobId,
      projectId: data?.projectId,
      status,
      progress: job.progress ?? 0,
      result: job.returnvalue ?? undefined,
      error: job.failedReason ?? undefined,
      attemptsMade: job.attemptsMade,
      maxAttempts: this.MAX_ATTEMPTS,
      createdAt: job.timestamp ?? Date.now(),
      finishedAt: job.finishedOn ?? undefined,
    };
  }
}
