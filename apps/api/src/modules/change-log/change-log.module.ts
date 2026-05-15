import { Module } from "@nestjs/common";
import { ChangeLogService } from "./change-log.service.js";
import { ChangeLogController } from "./change-log.controller.js";

@Module({
  controllers: [ChangeLogController],
  providers: [ChangeLogService],
  exports: [ChangeLogService],
})
export class ChangeLogModule {}
