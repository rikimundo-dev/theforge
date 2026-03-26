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

@Injectable()
export class DeliverablesQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DeliverablesQueueService.name);
  private queue: Queue | null = null;
  private worker: Worker | null = null;

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
      this.logger.log("BullMQ: sin REDIS_URL — generate-deliverables sigue siendo HTTP síncrono");
      return;
    }
    this.queue = new Queue(DELIVERABLES_QUEUE_NAME, {
      connection: { url },
      defaultJobOptions: {
        removeOnComplete: { age: 3600, count: 100 },
        removeOnFail: { age: 86_400, count: 40 },
        attempts: 1,
      },
    });
    this.worker = new Worker(
      DELIVERABLES_QUEUE_NAME,
      async (job: Job<{ projectId: string; userId: string }>) => {
        const { projectId, userId } = job.data;
        return runWithRequestUserAsync(userId, async () =>
          this.projects.generateDeliverablesCascade(projectId, (p) => job.updateProgress(p)),
        );
      },
      { connection: { url }, concurrency: 1 },
    );
    this.worker.on("failed", (job, err) => {
      this.logger.error(`Deliverables job ${job?.id} failed: ${err instanceof Error ? err.message : err}`);
    });
    this.logger.log(`BullMQ worker activo (${DELIVERABLES_QUEUE_NAME})`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
  }

  async enqueueCascade(projectId: string): Promise<string> {
    if (!this.queue) {
      throw new ServiceUnavailableException("Cola de entregables no inicializada (configure REDIS_URL)");
    }
    const userId = getRequestUserId();
    const job = await this.queue.add("cascade", { projectId, userId });
    return String(job.id);
  }

  async getJob(jobId: string): Promise<Job | undefined> {
    if (!this.queue) return undefined;
    return this.queue.getJob(jobId);
  }
}
