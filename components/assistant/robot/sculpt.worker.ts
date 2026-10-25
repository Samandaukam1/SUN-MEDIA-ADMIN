/// <reference lib="webworker" />
// Builds Sunny's geometry off the main thread (see sculpt.ts) and hands the arrays back without copying them.
import { sculpt } from './sculpt';

const scope = self as unknown as DedicatedWorkerGlobalScope;
scope.onmessage = (e: MessageEvent<{ alpha: Uint8ClampedArray; size: number; scale: number; center: [number, number]; step: number }>) => {
  const { alpha, size, ...options } = e.data;
  const parts = sculpt(alpha, size, options);
  scope.postMessage(
    parts,
    parts.flatMap((p) => [p.positions.buffer, p.normals.buffer, p.uvs.buffer, p.front.buffer, p.index.buffer, p.depth.zf.buffer]),
  );
};
