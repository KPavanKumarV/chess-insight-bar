// Stockfish engine hook using a CDN-hosted Web Worker (no npm import)
// Keeps a simple queued analysis interface compatible with UCI commands.

import { useRef } from "react";

export type EngineEval = { type: "cp" | "mate"; value: number };
export type EngineResult = {
  eval: EngineEval;
  bestMove: string; // UCI (e.g., e2e4)
  pv?: string;
};

// Use an asm.js build so we don't need separate .wasm assets
// cdnjs serves with proper CORS headers
const STOCKFISH_SCRIPT_URL =
  "https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.2/stockfish.js";

function parseInfoLine(line: string) {
  const parts = line.split(/\s+/);
  const idxScore = parts.indexOf("score");
  if (idxScore !== -1 && parts[idxScore + 1]) {
    const type = parts[idxScore + 1] as "cp" | "mate";
    const valueRaw = parts[idxScore + 2];
    const value = valueRaw ? parseInt(valueRaw, 10) : 0;
    const pvIdx = parts.indexOf("pv");
    const pv = pvIdx !== -1 ? parts.slice(pvIdx + 1).join(" ") : undefined;
    return { eval: { type, value } as EngineEval, pv };
  }
  return null;
}

export function mapEvalToCentipawns(e: EngineEval): number {
  if (e.type === "cp") return e.value;
  const sign = e.value === 0 ? 0 : e.value > 0 ? 1 : -1;
  return sign * 100000; // treat mate as decisive value
}

export function useStockfish() {
  const engineRef = useRef<Worker | null>(null);
  const readyRef = useRef<Promise<void> | null>(null);
  const queueRef = useRef<Promise<EngineResult>>(
    Promise.resolve({ eval: { type: "cp", value: 0 }, bestMove: "0000" })
  );

  const ensureEngine = async () => {
    if (typeof window === "undefined") return;
    if (engineRef.current && readyRef.current) return;

    // Fetch script (CORS) and spawn worker from blob (same-origin blob URL)
    const resp = await fetch(STOCKFISH_SCRIPT_URL, { mode: "cors" });
    if (!resp.ok) throw new Error(`Failed to fetch Stockfish: ${resp.status}`);
    const code = await resp.text();
    const blob = new Blob([code], { type: "text/javascript" });
    const blobUrl = URL.createObjectURL(blob);
    const engine = new Worker(blobUrl);
    engineRef.current = engine;

    readyRef.current = new Promise<void>((resolve) => {
      const onMsg = (e: MessageEvent) => {
        const text = typeof e.data === "string" ? e.data : "";
        if (text.includes("uciok")) {
          engine.removeEventListener("message", onMsg as any);
          engine.postMessage("isready");
          resolve();
        }
      };
      engine.addEventListener("message", onMsg as any);
      engine.postMessage("uci");
    });
  };

  const analyze = (fen: string, depth = 14): Promise<EngineResult> => {
    queueRef.current = queueRef.current.then(
      () =>
        new Promise<EngineResult>(async (resolve) => {
          try {
            await ensureEngine();
          } catch (e) {
            // Fallback if engine can't initialize
            resolve({ eval: { type: "cp", value: 0 }, bestMove: "0000" });
            return;
          }
          const engine = engineRef.current!;
          await readyRef.current!;

          let lastEval: EngineEval = { type: "cp", value: 0 };
          let lastPv: string | undefined;

          const onMessage = (e: MessageEvent) => {
            const text = typeof e.data === "string" ? e.data : "";
            if (text.startsWith("info ")) {
              const parsed = parseInfoLine(text);
              if (parsed) {
                lastEval = parsed.eval;
                lastPv = parsed.pv;
              }
            } else if (text.startsWith("bestmove ")) {
              const bestMove = text.split(" ")[1];
              engine.removeEventListener("message", onMessage as any);
              resolve({ eval: lastEval, bestMove, pv: lastPv });
            }
          };

          engine.addEventListener("message", onMessage as any);
          engine.postMessage("ucinewgame");
          engine.postMessage(`position fen ${fen}`);
          engine.postMessage(`go depth ${depth}`);
        })
    );

    return queueRef.current;
  };

  return { analyze };
}
