/**
 * HIGH complexity workshop flow (greenfield): tab order + short hints for the flow-order modal.
 */
export const HIGH_GREENFIELD_FLOW_STEPS = [
  {
    label: "Paso 0",
    description:
      "Resumen ejecutivo, problema y alcance: alinea visión antes de documentación pesada.",
  },
  {
    label: "BRD",
    description: "Requisitos de negocio: problema, KPIs, alcance y reglas con stakeholders.",
  },
  {
    label: "MDD",
    description: "Master Design Doc: modelo de datos, dominio y contratos técnicos centrales.",
  },
  {
    label: "Spec",
    description: "Especificación funcional/técnica derivada del MDD para construcción.",
  },
  {
    label: "Arq.",
    description: "Arquitectura de software: componentes, límites y decisiones estructurales.",
  },
  {
    label: "Casos",
    description: "Casos de uso concretos que cubren flujos frente al MDD y Spec.",
  },
  {
    label: "H.U.",
    description: "Historias de usuario priorizables para el equipo de entrega.",
  },
  {
    label: "Blueprint",
    description: "Blueprint técnico alineado al modelo de datos y servicios del MDD.",
  },
  {
    label: "Design System",
    description: "Tokens de diseño y UI Kit de ejemplo para una interfaz coherente.",
  },
  {
    label: "API",
    description: "Contratos API explícitos para integración entre cliente, BFF y servicios.",
  },
  {
    label: "Flujos",
    description: "Diagramas y flujos lógicos de negocio y sistema.",
  },
  {
    label: "Tasks",
    description: "Desglose ejecutable de trabajo (backlog / tareas) derivado del alcance.",
  },
  {
    label: "Infra",
    description: "Infraestructura, despliegue y operación según restricciones del proyecto.",
  },
] as const;

/** Long-form explanation for HIGH + legacy projects (modal body). */
export const HIGH_LEGACY_FLOW_MODAL_BODY =
  "MDD Inicial opcional con Ariadne para documentar el codebase de partida. Luego, cada modificación del legacy tiene su MDD de cambio y entregables asociados. Cada etapa del taller corresponde a una modificación con documentación actualizada vía Ariadne: mantén Spec, conformidad y semáforo al día antes de lanzar cascadas.";
