import { Controller, Get } from "@nestjs/common";
import { Public } from "./common/decorators/public.decorator.js";

/** Endpoint ligero para healthcheck de Docker/Dokploy (sin depender de DB). */
@Controller()
export class HealthController {
  @Public()
  @Get("health")
  health() {
    return { status: "ok" };
  }
}
