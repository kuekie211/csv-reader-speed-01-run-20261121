import { closeSync, openSync, readFileSync, writeSync } from 'node:fs';
import { join } from 'node:path';
import { setFlagsFromString } from 'node:v8';
setFlagsFromString('--no-incremental-marking --always-turbofan --no-concurrent-recompilation');
const { run } = (await import(new URL('./solve.js', import.meta.url).href)) as { run: (input: unknown) => unknown };
const INPUT_DIR = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const cases = JSON.parse(readFileSync(join(INPUT_DIR, 'cases.json'), 'utf8')) as { id: string; input: unknown }[];
const fd = openSync(join(OUTPUT_DIR, 'answers.json'), 'w');
function writeAll(bytes: Uint8Array) {
  let offset = 0;
  while (offset < bytes.length) {
    const written = writeSync(fd, bytes, offset, bytes.length - offset);
    if (written <= 0) throw new Error('output write stalled');
    offset += written;
  }
}
try {
  writeAll(Buffer.from('['));
  for (let i = 0; i < cases.length; i++) {
    if (i) writeAll(Buffer.from(','));
    writeAll(Buffer.from(JSON.stringify(run(cases[i].input))));
  }
  writeAll(Buffer.from(']'));
} finally {
  closeSync(fd);
}
