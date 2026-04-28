import { Injectable } from "@nestjs/common";
import type { TeamStructure } from "@theforge/shared-types";
import {
  computeCostEstimation,
  getDefaultTeamStructure as getDefaultTeamStructureCore,
  type CostEstimationInput,
} from "@theforge/business-rules";

export { parseInfraFixedHours } from "@theforge/business-rules";

export type EstimationInput = CostEstimationInput;

export interface EstimationResult {
  totalHours: number;
  totalMxn: number;
  referenceSaleMxn: number;
  teamStructure: TeamStructure;
  rolesHours: Record<string, number>;
}

@Injectable()
export class CostCalculatorService {
  /**
   * Estimación final (reglas en `@theforge/business-rules`).
   * Base = Entidades×12 + Pantallas×16 + Endpoints extra×4;
   * multiplicadores TechnicalMetadata; buffer si semáforo ≠ VERDE;
   * `totalMxn` = nómina ponderada (horas por rol × tarifa rol); `referenceSaleMxn` = horas × tarifa única.
   */
  calculate(input: EstimationInput): EstimationResult {
    return computeCostEstimation(input);
  }

  getDefaultTeamStructure(
    entityCount: number,
    screenCount: number,
    extraEndpointCount = 0,
    metadataTags: readonly string[] = [],
  ): TeamStructure {
    return getDefaultTeamStructureCore(entityCount, screenCount, extraEndpointCount, metadataTags);
  }
}
