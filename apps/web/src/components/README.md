# components

Componentes reutilizables. La UI usa **Kreo** (tema dorado/corporativo) vía `components/ui/`.

| Componente            | Uso                                                                                                                                                                                                                                                                           |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ChatContainer.tsx** | Columna de chat: mensajes con scroll automático, input y botón Enviar. Usa useInterview(projectId) para mensajes y sendMessage. **Re-Valorar** (header): si `onRevaluate` está definido, llama a `POST .../reassess-complexity` vía el store y envía el primer mensaje de entrevista (WorkshopView). **Multi-etapa:** si hay más de una `Stage`, al **cambiar de etapa** (selector en `WorkshopView`) muestra un aviso de historial global. Mensajes con `stageId` en el log muestran badge “Etapa: …”. Si el orquestador envía `evaluatorCritique` en el `done` del stream, muestra un bloque violeta en el hilo (`clearEvaluatorCritique` cierra el panel). En tab MDD, si hay `pendingPlanApproval` (HITL 4.4), muestra una tarjeta con el plan propuesto y botones "Ejecutar" / "Modificar".            |
| **MddViewer.tsx**     | Visualizador de MDD por cabeceras (##, ###), ReactMarkdown por sección, `mermaid`, re-render parcial en streaming. |
| **WorkshopHelpModal.tsx** | Modal de ayuda: lee [content/workshop-manual.md](../content/workshop-manual.md) vía `?raw`, render con `react-markdown` + `remark-gfm`. Cierre con X, Escape o clic fuera. |
| **ComplexityPendingBanner.tsx** | Si `project.complexityPending` (HITL tras DBGA / inferencia), banner ámbar con plan y botones **Confirmar** (`POST /projects/:id/confirm-complexity`) / **Descartar** (`PATCH` con `clearComplexityPending`). El chat también puede confirmar o rechazar por texto. |

Texto del manual: `src/content/workshop-manual.md` (flujo Workshop, semáforo, Legacy, etapas).
