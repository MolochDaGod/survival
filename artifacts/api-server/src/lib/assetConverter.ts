/**
 * Asset converter — turns source 3D formats (FBX, OBJ, DAE, 3DS, STL, PLY, BLEND, glTF text)
 * into game-ready binary glTF 2.0 (.glb) using the `assimp` CLI.
 *
 * Why GLB? three.js's GLTFLoader is the canonical loader: it streams, supports
 * PBR + skinning + animation, and ships in the runtime we already use in
 * artifacts/arpg-game. FBX requires a much heavier loader and is not the
 * format we want sitting in R2 long-term.
 *
 * Usage:
 *   const buf = await convertToGlb({ sourceBuffer, sourceExt: 'fbx' });
 *
 * The function streams source bytes through a temp file, runs `assimp export
 * <input> <output> -fglb2`, and returns the resulting GLB as a Buffer.
 * Callers are responsible for uploading the result back to R2 / cataloging it.
 */
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Extensions assimp can read AND that we want to expose as "convert to GLB" candidates. */
const CONVERTIBLE_EXTS = new Set([
  'fbx',
  'obj',
  'dae',   // Collada
  '3ds',
  'ply',
  'stl',
  'blend',
  'gltf',  // text-glTF → binary GLB is a real use case (smaller, single file)
  'x',     // DirectX
  'ms3d',
  'lwo',
  'md5mesh',
]);

/** Quick gate so callers can hide the menu item for non-mesh assets. */
export function isConvertibleSourceExt(ext: string): boolean {
  return CONVERTIBLE_EXTS.has(ext.toLowerCase().replace(/^\./, ''));
}

export function extFromPath(p: string): string {
  const dot = p.lastIndexOf('.');
  if (dot < 0) return '';
  return p.slice(dot + 1).toLowerCase();
}

/** Replace (or append) the file extension with `.glb`. Preserves the directory path. */
export function withGlbExtension(path: string): string {
  const slash = path.lastIndexOf('/');
  const dir   = slash >= 0 ? path.slice(0, slash + 1) : '';
  const file  = slash >= 0 ? path.slice(slash + 1)    : path;
  const dot   = file.lastIndexOf('.');
  const stem  = dot > 0 ? file.slice(0, dot) : file;
  return `${dir}${stem}.glb`;
}

export interface ConvertOptions {
  sourceBuffer: Buffer;
  sourceExt: string;
  /** Hard timeout in ms; default 90s is plenty for tens of MB of FBX. */
  timeoutMs?: number;
  /** Optional logger so the route can write to req.log. */
  log?: { info: (msg: string, ...args: unknown[]) => void; warn: (msg: string, ...args: unknown[]) => void };
}

export interface ConvertResult {
  glb: Buffer;
  /** assimp's stderr — useful for surfacing warnings even on success. */
  stderr: string;
  /** Wall-clock conversion time in ms. */
  durationMs: number;
}

/**
 * Spawn `assimp export <in> <out> -fglb2` in an isolated tempdir. Always cleans
 * up after itself (including on failure). Throws on non-zero exit or timeout.
 */
export async function convertToGlb(opts: ConvertOptions): Promise<ConvertResult> {
  const ext = opts.sourceExt.toLowerCase().replace(/^\./, '');
  if (!isConvertibleSourceExt(ext)) {
    throw new Error(`Unsupported source extension: .${ext}`);
  }
  const dir = await mkdtemp(join(tmpdir(), 'gn-convert-'));
  const inputPath  = join(dir, `input.${ext}`);
  const outputPath = join(dir, 'output.glb');
  const timeoutMs = opts.timeoutMs ?? 90_000;
  const startedAt = Date.now();
  try {
    await writeFile(inputPath, opts.sourceBuffer);
    opts.log?.info(`[convert] assimp export ${ext} → glb (${opts.sourceBuffer.length} B)`);
    const stderr = await runAssimp(inputPath, outputPath, timeoutMs);
    const glb = await readFile(outputPath);
    return { glb, stderr, durationMs: Date.now() - startedAt };
  } finally {
    // Best-effort cleanup; do not let a tempdir leak block the response.
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

function runAssimp(inputPath: string, outputPath: string, timeoutMs: number): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    // -fglb2 = binary glTF 2.0; we don't need any of the optional flags here
    // because assimp's defaults already do triangulation, generate normals,
    // and embed textures referenced by relative paths inside the source file.
    const child = spawn('assimp', ['export', inputPath, outputPath, '-fglb2'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8'); });
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8'); });
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`assimp timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(new Error(`assimp spawn failed: ${err.message}`));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve(stderr || stdout);
      } else {
        reject(new Error(
          `assimp exited with code ${code}\n` +
          `stderr: ${stderr.trim().slice(0, 500)}`,
        ));
      }
    });
  });
}
