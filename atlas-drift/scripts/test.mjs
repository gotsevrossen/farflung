import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
await mkdir('.sites-runtime',{recursive:true});
await build({entryPoints:['tests/game.test.ts'],bundle:true,platform:'node',format:'esm',outfile:'.sites-runtime/game-tests.mjs'});
const result=spawnSync(process.execPath,['--test','.sites-runtime/game-tests.mjs'],{stdio:'inherit'});
process.exitCode=result.status??1;
