import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module.js";
import { UserProvidersController } from "./user-providers.controller.js";
import { UserProvidersService } from "./user-providers.service.js";

@Module({
  imports: [PrismaModule],
  controllers: [UserProvidersController],
  providers: [UserProvidersService],
  exports: [UserProvidersService],
})
export class UserProvidersModule {}
