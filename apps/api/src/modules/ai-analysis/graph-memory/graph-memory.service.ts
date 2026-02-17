import { FalkorDB, Graph } from "falkordb";
import { MddStructured } from "../state/mdd-structured.schema.js";
import { Inject, Injectable, Logger, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { LLMProvider, LLM_PROVIDER } from "../../ai/interfaces/llm-provider.interface.js";

@Injectable()
export class GraphMemoryService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(GraphMemoryService.name);
    private client: FalkorDB | null = null;
    private graph: Graph | null = null;
    private readonly graphName = "theforge_memory";

    constructor(
        @Inject(LLM_PROVIDER)
        private readonly aiProvider: LLMProvider,
    ) { }

    async onModuleInit() {
        const url = process.env.FALKORDB_URL || "redis://localhost:6379";
        try {
            this.client = await FalkorDB.connect({ url });
            this.graph = this.client.selectGraph(this.graphName);
            this.logger.log(`Conectado a FalkorDB en ${url}`);

            // Inicializar índices vectoriales
            await this.initializeIndices();
        } catch (err) {
            this.logger.error(`Error conectando a FalkorDB: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    private async initializeIndices() {
        if (!this.graph) return;
        try {
            // Detectar dimensión del proveedor
            const dummy = await this.aiProvider.generateEmbedding("test");
            const dim = dummy.length;
            if (dim === 0) return;

            // Intentar crear índice para Proyectos (basado en título/contenido)
            try {
                await this.graph.query(`CALL db.idx.vector.create('Project', 'embedding', $dim, 'cosine')`, { params: { dim } });
                this.logger.log(`Índice vectorial creado para 'Project' con dimensión ${dim}`);
            } catch (e) {
                // Probablemente ya existe
            }

            // Índice vectorial para Decisiones (ADRs)
            try {
                await this.graph.query(`CALL db.idx.vector.create('Decision', 'embedding', $dim, 'cosine')`, { params: { dim } });
                this.logger.log(`Índice vectorial creado para 'Decision' con dimensión ${dim}`);
            } catch (e) {
                // Ya existe
            }
        } catch (err) {
            this.logger.warn(`No se pudieron inicializar índices vectoriales: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    async onModuleDestroy() {
        if (this.client) {
            try {
                await this.client.close();
            } catch (err) {
                this.logger.error(`Error cerrando FalkorDB: ${err instanceof Error ? err.message : String(err)}`);
            }
        }
    }

    /**
     * Registra un proyecto en el grafo con su embedding.
     */
    async ensureProject(projectId: string, title?: string) {
        if (!this.graph) return;
        const textToEmbed = title || projectId;
        const embedding = await this.aiProvider.generateEmbedding(textToEmbed);

        const query = `
      MERGE (p:Project {id: $id}) 
      SET p.title = $title, p.embedding = $embedding 
      RETURN p
    `;
        await this.graph.query(query, { params: { id: projectId, title: textToEmbed, embedding } });
    }

    /**
     * Guarda/sincroniza el estado estructurado del MDD en el grafo.
     */
    async syncMddToGraph(projectId: string, structured: MddStructured) {
        if (!this.graph) return;
        this.logger.log(`[GraphMemory] Sincronizando MDD para proyecto ${projectId}`);

        try {
            // Usamos el título y un resumen del contexto para el embedding del proyecto
            const contextSummary = structured.contextoAlcance || "";
            const textToEmbed = `${structured.title || projectId}\n${contextSummary}`.slice(0, 2000);
            const embedding = await this.aiProvider.generateEmbedding(textToEmbed);

            await this.graph.query(`
        MERGE (p:Project {id: $id})
        SET p.title = $title, p.embedding = $embedding
        RETURN p
      `, { params: { id: projectId, title: structured.title || projectId, embedding } });

            // 1. Tablas SQL
            if (structured.modeloDatos?.sql) {
                const tables = this.extractTablesFromSql(structured.modeloDatos.sql);
                for (const tableName of tables) {
                    const tableQuery = `
            MERGE (t:Table {name: $tableName, projectId: $projectId})
            WITH t
            MATCH (p:Project {id: $projectId})
            MERGE (p)-[:HAS_TABLE]->(t)
            RETURN t
          `;
                    await this.graph.query(tableQuery, { params: { tableName, projectId } });
                }
            }

            // 2. Endpoints API
            if (structured.contratosApi?.endpoints) {
                for (const ep of structured.contratosApi.endpoints) {
                    const endpointName = `${ep.method} ${ep.path}`;
                    const epQuery = `
            MERGE (e:API_Endpoint {id: $id, projectId: $projectId})
            SET e.method = $method, e.path = $path, e.description = $desc
            WITH e
            MATCH (p:Project {id: $projectId})
            MERGE (p)-[:HAS_ENDPOINT]->(e)
            RETURN e
          `;
                    await this.graph.query(epQuery, {
                        params: {
                            id: `${projectId}:${endpointName}`,
                            method: ep.method,
                            path: ep.path,
                            desc: ep.description || "",
                            projectId,
                        },
                    });
                }
            }

            // 3. Reglas de Seguridad
            if (structured.seguridad) {
                for (const s of structured.seguridad) {
                    const ruleQuery = `
            MERGE (r:SecurityRule {title: $title, projectId: $projectId})
            SET r.content = $content
            WITH r
            MATCH (p:Project {id: $projectId})
            MERGE (p)-[:GOVERNED_BY]->(r)
            RETURN r
          `;
                    await this.graph.query(ruleQuery, {
                        params: {
                            title: s.title,
                            content: s.content.join("\n"),
                            projectId,
                        },
                    });
                }
            }
        } catch (err) {
            this.logger.error(`Error sincronizando MDD al grafo: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    /**
     * Búsqueda híbrida (GraphRAG):
     * 1. Vector Search para encontrar proyectos similares.
     * 2. Traversal para recuperar sus tablas y contratos.
     */
    async searchSimilarProjects(query: string, limit = 3) {
        if (!this.graph) return [];
        try {
            const embedding = await this.aiProvider.generateEmbedding(query);
            if (embedding.length === 0) return [];

            // Query híbrida: busca proyectos similares y trae sus artefactos
            const cypher = `
        CALL db.idx.vector.queryNodes('Project', 'embedding', $limit, $embedding)
        YIELD node AS project, score
        OPTIONAL MATCH (project)-[:HAS_TABLE]->(t:Table)
        OPTIONAL MATCH (project)-[:HAS_ENDPOINT]->(e:API_Endpoint)
        RETURN project.id as id, project.title as title, score,
               collect(distinct t.name) as tables,
               collect(distinct e.path) as endpoints
        ORDER BY score DESC
      `;
            const result = await this.graph.query(cypher, { params: { embedding, limit } });
            return result.data;
        } catch (err) {
            this.logger.error(`Error en búsqueda similar: ${err instanceof Error ? err.message : String(err)}`);
            return [];
        }
    }

    /**
     * Búsqueda híbrida (GraphRAG): busca por patrones en el grafo.
     */
    async queryKnowledge(cypher: string, params?: Record<string, any>) {
        if (!this.graph) return null;
        return await this.graph.query(cypher, { params });
    }

    /**
     * Registra una decisión arquitectónica (ADR) en el grafo.
     */
    async saveDecision(projectId: string, decision: { title: string, context: string, consequence: string, status?: string }) {
        if (!this.graph) return;
        this.logger.log(`[GraphMemory] Guardando decisión ADR: ${decision.title}`);

        try {
            const textToEmbed = `${decision.title}\n${decision.context}\n${decision.consequence}`.slice(0, 2000);
            const embedding = await this.aiProvider.generateEmbedding(textToEmbed);

            const query = `
        MATCH (p:Project {id: $projectId})
        MERGE (d:Decision {id: $id, projectId: $projectId})
        SET d.title = $title, 
            d.context = $context, 
            d.consequence = $consequence, 
            d.status = $status,
            d.embedding = $embedding
        MERGE (p)-[:MADE_DECISION]->(d)
        RETURN d
      `;
            await this.graph.query(query, {
                params: {
                    id: `${projectId}:${decision.title.replace(/\s+/g, "_").toLowerCase()}`,
                    projectId,
                    title: decision.title,
                    context: decision.context,
                    consequence: decision.consequence,
                    status: decision.status || "Accepted",
                    embedding
                }
            });
        } catch (err) {
            this.logger.error(`Error guardando decisión ADR: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    /**
     * Búsqueda híbrida de decisiones pasadas.
     */
    async searchSimilarDecisions(query: string, limit = 5) {
        if (!this.graph) return [];
        try {
            const embedding = await this.aiProvider.generateEmbedding(query);
            if (embedding.length === 0) return [];

            const cypher = `
        CALL db.idx.vector.queryNodes('Decision', 'embedding', $limit, $embedding)
        YIELD node AS decision, score
        MATCH (p:Project)-[:MADE_DECISION]->(decision)
        RETURN decision.title as title, 
               decision.context as context, 
               decision.consequence as consequence,
               decision.status as status,
               p.title as projectTitle,
               score
        ORDER BY score DESC
      `;
            const result = await this.graph.query(cypher, { params: { embedding, limit } });
            return result.data;
        } catch (err) {
            this.logger.error(`Error en búsqueda de decisiones: ${err instanceof Error ? err.message : String(err)}`);
            return [];
        }
    }

    /**
     * Obtiene todas las decisiones (ADRs) asociadas a un proyecto específico.
     */
    async getDecisionsByProject(projectId: string) {
        if (!this.graph) return [];
        try {
            const cypher = `
                MATCH (p:Project {id: $projectId})-[:MADE_DECISION]->(d:Decision)
                RETURN d.title as title, 
                       d.context as context, 
                       d.consequence as consequence,
                       d.status as status,
                       p.title as projectTitle
                ORDER BY d.title ASC
            `;
            const result = await this.graph.query(cypher, { params: { projectId } });
            return result.data;
        } catch (err) {
            this.logger.error(`Error obteniendo decisiones del proyecto ${projectId}: ${err instanceof Error ? err.message : String(err)}`);
            return [];
        }
    }

    /**
     * Helper simple para extraer nombres de tablas de un bloque SQL.
     */
    private extractTablesFromSql(sql: string): string[] {
        const tableNames: string[] = [];
        const regex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z0-9_".]+)/gi;
        let match;
        while ((match = regex.exec(sql)) !== null) {
            if (match[1]) {
                const clean = match[1].replace(/["']/g, "");
                tableNames.push(clean);
            }
        }
        return [...new Set(tableNames)];
    }
}
