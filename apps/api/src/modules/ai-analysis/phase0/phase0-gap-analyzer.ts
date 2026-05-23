/**
 * Phase0GapAnalyzer — detecta qué información falta en el borrador
 * y la prioriza por criticidad. Sin dependencias de LLM, es pura lógica.
 */

import type { Phase0Document, Phase0Gap } from "./phase0.types.js";
import { GAP_WEIGHT } from "./phase0.types.js";

/**
 * Analiza el borrador y produce gaps priorizados.
 * Regla: solo gaps que realmente bloquean o degradan el MDD.
 */
export function analyzeGaps(borrador: Phase0Document): Phase0Gap[] {
  const gaps: Phase0Gap[] = [];

  // 1. PROPÓSITO — crítico si falta
  if (!borrador.proposito.problema || borrador.proposito.problema.length < 10) {
    gaps.push({
      seccion: "proposito",
      criticidad: "critico",
      descripcion: "No se ha definido el problema principal que resuelve el sistema",
      razon: "Sin propósito claro, el MDD no tiene dirección ni límites",
      sugerenciaPregunta: "¿Cuál es el problema principal que resuelve este sistema?",
    });
  }

  if (!borrador.proposito.usuarios || borrador.proposito.usuarios.length === 0) {
    gaps.push({
      seccion: "proposito",
      criticidad: "critico",
      descripcion: "No se han identificado los usuarios objetivo",
      razon: "Sin usuarios, el MDD no puede definir roles, permisos ni flujos",
      sugerenciaPregunta: "¿Quiénes van a usar este sistema?",
    });
  }

  // 2. ENTIDADES — crítico si vacío o sospechosamente genérico
  if (!borrador.entidades || borrador.entidades.length === 0) {
    gaps.push({
      seccion: "entidades",
      criticidad: "critico",
      descripcion: "No se han identificado entidades del dominio",
      razon: "El MDD §3 (Modelo de Datos) no puede generarse sin entidades",
      sugerenciaPregunta: "¿Qué cosas o conceptos principales maneja el sistema? (ej: proyectos, usuarios, facturas...)",
    });
  } else if (borrador.entidades.length < 2) {
    gaps.push({
      seccion: "entidades",
      criticidad: "critico",
      descripcion: `Solo se identificó 1 entidad (${borrador.entidades[0].nombre})`,
      razon: "Un sistema con una entidad es improbable. Faltan más entidades del dominio",
      sugerenciaPregunta: `Además de "${borrador.entidades[0].nombre}", ¿qué otras entidades o conceptos existen?`,
    });
  }

  // 3. REGLAS DE NEGOCIO — crítico si vacío
  if (!borrador.reglasNegocio || borrador.reglasNegocio.length === 0) {
    gaps.push({
      seccion: "reglasNegocio",
      criticidad: "critico",
      descripcion: "No se han definido reglas de negocio",
      razon: "Sin reglas, la IA inventa validaciones genéricas que pueden ser incorrectas",
      sugerenciaPregunta: "¿Hay reglas importantes del negocio? (ej: 'un usuario solo puede tener un proyecto activo')",
    });
  }

  // 4. ROLES — crítico si vacío
  if (!borrador.roles || borrador.roles.length === 0) {
    gaps.push({
      seccion: "roles",
      criticidad: "critico",
      descripcion: "No se han definido roles ni permisos",
      razon: "El MDD §6 (Seguridad) no puede generarse correctamente sin roles",
      sugerenciaPregunta: "¿Qué tipos de usuarios hay y qué puede hacer cada uno?",
    });
  }

  // 5. FLUJOS — importante si vacío
  if (!borrador.flujos || borrador.flujos.length === 0) {
    gaps.push({
      seccion: "flujos",
      criticidad: "importante",
      descripcion: "No se han definido flujos principales",
      razon: "Los flujos guían los casos de uso y las HU; sin ellos la implementación solo cubre happy path",
      sugerenciaPregunta: "¿Cuál es el flujo principal de principio a fin?",
    });
  }

  // 6. EDGE CASES — importante si vacío
  if (!borrador.edgeCases || borrador.edgeCases.length === 0) {
    gaps.push({
      seccion: "edgeCases",
      criticidad: "importante",
      descripcion: "No se han identificado edge cases o supuestos",
      razon: "Sin edge cases, la IA implementa solo el camino feliz",
      sugerenciaPregunta: "¿Qué debería pasar si algo sale mal? (ej: el pago falla, el servidor no responde...)",
    });
  }

  // 7. OUT OF SCOPE — importante si vacío
  if (!borrador.proposito.outOfScope || borrador.proposito.outOfScope.length === 0) {
    gaps.push({
      seccion: "proposito",
      criticidad: "importante",
      descripcion: "No se ha definido qué NO hace el sistema",
      razon: "Sin límites claros, la IA puede generar features que no pidieron",
      sugerenciaPregunta: "¿Hay algo que este sistema NO deba hacer? (límites explícitos)",
    });
  }

  return gaps.sort((a, b) => GAP_WEIGHT[a.criticidad] - GAP_WEIGHT[b.criticidad]);
}

/**
 * Filtra gaps que ya no aplican basado en el contenido actual del borrador.
 */
export function filterResolvedGaps(
  gaps: Phase0Gap[],
  borrador: Phase0Document,
): Phase0Gap[] {
  return gaps.filter((gap) => {
    switch (gap.seccion) {
      case "entidades":
        return !borrador.entidades || borrador.entidades.length < 2;
      case "reglasNegocio":
        return !borrador.reglasNegocio || borrador.reglasNegocio.length === 0;
      case "flujos":
        return !borrador.flujos || borrador.flujos.length === 0;
      case "roles":
        return !borrador.roles || borrador.roles.length === 0;
      case "integraciones":
        return !borrador.integraciones || borrador.integraciones.length === 0;
      case "edgeCases":
        return !borrador.edgeCases || borrador.edgeCases.length === 0;
      case "proposito":
        if (gap.descripcion.includes("problema principal")) {
          return !borrador.proposito.problema || borrador.proposito.problema.length < 10;
        }
        if (gap.descripcion.includes("usuarios objetivo")) {
          return !borrador.proposito.usuarios || borrador.proposito.usuarios.length === 0;
        }
        if (gap.descripcion.includes("NO hace")) {
          return !borrador.proposito.outOfScope || borrador.proposito.outOfScope.length === 0;
        }
        return true;
      default:
        return false;
    }
  });
}