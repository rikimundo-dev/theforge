import {
  type ArgumentsHost,
  type ExceptionFilter,
  Catch,
  HttpStatus,
} from "@nestjs/common";
import type { Response } from "express";
import {
  ModelsUnavailableError,
  MODELS_UNAVAILABLE_CODE,
} from "../../modules/ai/config/llm-model-fallback.js";

/** Respuesta HTTP coherente cuando se agota la cadena de modelos LLM. */
@Catch(ModelsUnavailableError)
export class ModelsUnavailableExceptionFilter implements ExceptionFilter {
  catch(exception: ModelsUnavailableError, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    res.status(HttpStatus.SERVICE_UNAVAILABLE).json({
      statusCode: HttpStatus.SERVICE_UNAVAILABLE,
      message: exception.message,
      code: MODELS_UNAVAILABLE_CODE,
      ...(exception.details ? { details: exception.details } : {}),
    });
  }
}
