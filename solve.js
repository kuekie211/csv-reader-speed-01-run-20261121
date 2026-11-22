import { readFileSync } from 'node:fs';
const mod = new WebAssembly.Module(readFileSync(new URL('./csv-full.wasm', import.meta.url)));
const ex = new WebAssembly.Instance(mod).exports;
export function runBytes(input) {
  const text = String(input.text);
  const len = text.length;
  const ptr = 67108864;
  const need = ptr + len * 2;
  if (need > ex.memory.buffer.byteLength) ex.memory.grow(Math.ceil((need - ex.memory.buffer.byteLength) / 65536));
  const view = Buffer.from(ex.memory.buffer, ptr, len * 2);
  view.write(text, 0, len * 2, 'utf16le');
  const out = ex.parse(ptr, len, input.header === true ? 1 : 0);
  return Buffer.from(ex.memory.buffer, out, ex.output_len());
}
export function runJSON(input) { return runBytes(input).toString('utf8'); }
export function run(input) { return JSON.parse(runJSON(input)); }
