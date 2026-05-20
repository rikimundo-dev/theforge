#!/usr/bin/env node
/**
 * Asegura que Colima (runtime de contenedores) y los contenedores de infraestructura
 * (Postgres y FalkorDB) existan y estén en ejecución.
 */

const { spawnSync } = require('child_process');

const POSTGRES_NAME = 'theforge-db';
const FALKOR_NAME = 'theforge-falkor-sdd';
const COLIMA_START_ARGS = '--cpu 2 --memory 4';

const POSTGRES_RUN_ARGS = [
  '-d',
  '--name', POSTGRES_NAME,
  '-e', 'POSTGRES_USER=theforge',
  '-e', 'POSTGRES_PASSWORD=theforge',
  '-e', 'POSTGRES_DB=theforge',
  '-p', '5432:5432',
  'postgres:15-alpine',
];

const FALKOR_RUN_ARGS = [
  '-d',
  '--name', FALKOR_NAME,
  '-p', '6379:6379',
  'falkordb/falkordb:latest',
];

function run(cmd, options = {}) {
  return spawnSync(cmd, [], {
    encoding: 'utf8',
    shell: true,
    ...options,
  });
}

function dockerDaemonReady() {
  const info = run('docker info');
  return info.status === 0;
}

function ensureContainerRuntime() {
  if (dockerDaemonReady()) {
    console.log('[ensure-infra] Docker disponible.');
    return 0;
  }

  const colimaCheck = run('command -v colima');
  if (colimaCheck.status !== 0) {
    console.error(
      '[ensure-infra] Docker no responde y Colima no está instalado.',
      'Abre Docker Desktop o instala Colima: brew install colima',
    );
    return 1;
  }

  const status = run('colima status');
  if (status.status === 0) {
    console.log('[ensure-infra] Colima ya está en ejecución.');
    return 0;
  }
  console.log('[ensure-infra] Iniciando Colima (--cpu 2 --memory 4)...');
  const start = run(`colima start ${COLIMA_START_ARGS}`);
  if (start.status !== 0) {
    console.error('[ensure-infra] Error al iniciar Colima:', start.stderr || start.error);
    return 1;
  }
  console.log('[ensure-infra] Colima iniciado.');
  return 0;
}

function getContainerStatus(name) {
  const result = run(
    `docker ps -a --filter name=^${name}$ --format "{{.Names}}\t{{.Status}}"`,
  );
  if (result.status !== 0 || !result.stdout || !result.stdout.trim()) {
    return { exists: false, running: false };
  }
  const line = result.stdout.trim().split('\n')[0] || '';
  const [foundName, status] = line.split('\t');
  if (foundName !== name) return { exists: false, running: false };
  return { exists: true, running: (status || '').toLowerCase().startsWith('up') };
}

function ensureContainer(name, runArgs) {
  const { exists, running } = getContainerStatus(name);
  if (running) {
    console.log(`[ensure-infra] ${name} ya está en ejecución.`);
    return 0;
  }
  if (exists) {
    console.log(`[ensure-infra] Iniciando ${name}...`);
    const start = run(`docker start ${name}`);
    if (start.status !== 0) {
      console.error(`[ensure-infra] Error al iniciar ${name}:`, start.stderr || start.error);
      return 1;
    }
    console.log(`[ensure-infra] ${name} iniciado.`);
    return 0;
  }
  console.log(`[ensure-infra] Creando e iniciando ${name}...`);
  const create = run(`docker run ${runArgs.join(' ')}`);
  if (create.status !== 0) {
    console.error(`[ensure-infra] Error al crear ${name}:`, create.stderr || create.error);
    return 1;
  }
  console.log(`[ensure-infra] ${name} creado e iniciado.`);
  return 0;
}

function main() {
  const runtimeOk = ensureContainerRuntime();
  if (runtimeOk !== 0) return runtimeOk;

  const pgOk = ensureContainer(POSTGRES_NAME, POSTGRES_RUN_ARGS);
  if (pgOk !== 0) return pgOk;

  const falkorOk = ensureContainer(FALKOR_NAME, FALKOR_RUN_ARGS);
  return falkorOk;
}

const code = main();
process.exit(code);
