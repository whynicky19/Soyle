import { copyFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
const require = createRequire(import.meta.url);
const runtime = dirname(require.resolve('@rive-app/webgl2'));
const destination = new URL('../public/mascot/', import.meta.url);
await mkdir(destination, { recursive: true });
for (const file of ['rive.wasm', 'rive_fallback.wasm']) await copyFile(join(runtime, file), new URL(file, destination));
