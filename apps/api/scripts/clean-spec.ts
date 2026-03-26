import { NestFactory } from "@nestjs/core";
import { AppModule } from "../src/app.module.js";
import { runWithRequestUserAsync } from "../src/common/request-user.store.js";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { ProjectsService } from "../src/modules/projects/projects.service.js";

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const projectsService = app.get(ProjectsService);
  const prisma = app.get(PrismaService);

  const projectId = process.env.CLEAN_SPEC_PROJECT_ID ?? "3";
  const user = await prisma.user.findFirst();
  if (!user) {
    console.error("No hay usuarios en BD; ejecuta al menos un login OTP antes de usar este script.");
    await app.close();
    process.exit(1);
  }

  console.log(`Cleaning Spec content for project ${projectId} (user ${user.id})...`);

  try {
    await runWithRequestUserAsync(user.id, async () => {
      const project = await projectsService.findOne(projectId);
      if (!project) {
        console.error("Project not found");
        process.exit(1);
        return;
      }

      const raw = project.specContent || "";
      console.log("Current content start:", raw.slice(0, 50).replace(/\n/g, "\\n"));

      const cleaned = raw
        .replace(/^\s*```(?:markdown)?\s*/i, "")
        .replace(/^\s*```\s*/, "")
        .replace(/\s*```\s*$/, "");

      if (raw !== cleaned) {
        await projectsService.update(projectId, { specContent: cleaned });
        console.log("Content cleaned and saved.");
        console.log("New content start:", cleaned.slice(0, 50).replace(/\n/g, "\\n"));
      } else {
        console.log("Content was already clean.");
      }
    });
  } catch (error) {
    console.error("Error cleaning content:", error);
  } finally {
    await app.close();
  }
}

bootstrap();
