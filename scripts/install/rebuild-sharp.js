#!/usr/bin/env node

const { spawnSync } = require('child_process');

const force = process.env.SHARP_FORCE_GLOBAL_LIBVIPS;

if (!force || force === '0' || force.toLowerCase() === 'false') {
  process.exit(0);
}

console.log('Rebuilding sharp against system libvips (SHARP_FORCE_GLOBAL_LIBVIPS=1)');

const npmExec = process.env.npm_execpath || process.env.NPM_CLI_JS || 'npm';
const isJsEntrypoint = npmExec.endsWith('.js');
const command = isJsEntrypoint ? process.execPath : npmExec;
const args = (isJsEntrypoint ? [npmExec] : []).concat(['rebuild', 'sharp', '--build-from-source']);

const result = spawnSync(command, args, {
  stdio: 'inherit',
  env: process.env,
});

if (result.error) {
  console.error('Failed to spawn npm to rebuild sharp:', result.error);
  process.exit(result.status ?? 1);
}

process.exit(result.status ?? 0);

