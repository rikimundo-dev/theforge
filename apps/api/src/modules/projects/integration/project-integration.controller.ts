import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { integrationProjectPickerQuerySchema } from "@theforge/shared-types";
import { ProjectIntegrationService } from "./project-integration.service.js";

@Controller("projects/:projectId/integration")
export class ProjectIntegrationController {
  constructor(private readonly integration: ProjectIntegrationService) {}

  @Get()
  getStatus(@Param("projectId") projectId: string) {
    return this.integration.getStatus(projectId);
  }

  @Get("picker")
  listPicker(
    @Param("projectId") _projectId: string,
    @Query() query: Record<string, string | undefined>,
  ) {
    const { targetType, q } = integrationProjectPickerQuerySchema.parse(query);
    return this.integration.listPickerProjects(targetType, q);
  }

  @Patch("link")
  patchLink(@Param("projectId") projectId: string, @Body() body: unknown) {
    return this.integration.patchLink(projectId, body);
  }

  @Get("context")
  getContext(@Param("projectId") projectId: string) {
    return this.integration.getLegacyContextForNew(projectId);
  }

  @Post("handoff/items")
  createItem(@Param("projectId") projectId: string, @Body() body: unknown) {
    return this.integration.createHandoffItem(projectId, body);
  }

  @Patch("handoff/items/:itemId")
  updateItem(
    @Param("projectId") projectId: string,
    @Param("itemId") itemId: string,
    @Body() body: unknown,
  ) {
    return this.integration.updateHandoffItem(projectId, itemId, body);
  }

  @Delete("handoff/items/:itemId")
  deleteItem(@Param("projectId") projectId: string, @Param("itemId") itemId: string) {
    return this.integration.deleteHandoffItem(projectId, itemId);
  }

  @Post("handoff/send")
  sendHandoff(@Param("projectId") projectId: string) {
    return this.integration.sendHandoff(projectId);
  }

  @Get("traces")
  listTraces(@Param("projectId") projectId: string) {
    return this.integration.getStatus(projectId).then((s) => s.traces);
  }

  @Patch("traces/:traceId")
  updateTrace(
    @Param("projectId") projectId: string,
    @Param("traceId") traceId: string,
    @Body() body: unknown,
  ) {
    return this.integration.updateTrace(projectId, traceId, body);
  }

  @Post("promote-to-stage")
  promoteToStage(@Param("projectId") projectId: string, @Body() body: unknown) {
    return this.integration.promoteHandoffToStage(projectId, body);
  }

  @Post("stages/:stageId/import-handoff")
  importHandoff(
    @Param("projectId") projectId: string,
    @Param("stageId") stageId: string,
  ) {
    return this.integration.importHandoffToStage(projectId, stageId);
  }
}
