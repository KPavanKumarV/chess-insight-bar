// Stockfish engine hook using a CDN-hosted Web Worker (no npm import)
// Keeps a simple queued analysis interface compatible with UCI commands.

import { useRef } from "react";

export type EngineEval = { type: "cp" | "mate"; value: number };
export type EngineResult = {
  eval: EngineEval;
  bestMove: string; // UCI (e.g., e2e4)
  pv?: string;
};

const STOCKFISH_URL = "https://cdn.jsdelivr.net/npm/stockfish@16/stockfish.js";

function parseInfoLine(line: string) {
  // examples:
  // info depth 15 score cp 23 nodes 12345 nps 56789 tbhits 0 time 123 pv e2e4 e7e5 g1f3
  // info depth 20 score mate 3 ...
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
  // Mate scores: map to very large centipawn values preserving sign
  const sign = e.value === 0 ? 0 : e.value > 0 ? 1 : -1;
  return sign * 100000; // treat mate as decisive value
}

export function useStockfish() {
  const engineRef = useRef<Worker | null>(null);
  const readyRef = useRef<Promise<void> | null>(null);
  const queueRef = useRef<Promise<EngineResult>>(
    Promise.resolve({ eval: { type: "cp", value: 0 }, bestMove: "0000" })
  );

  if (typeof window !== "undefined" && !engineRef.current) {
    const engine = new Worker(STOCKFISH_URL);
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
  }

  const analyze = (fen: string, depth = 14): Promise<EngineResult> => {
    if (!engineRef.current || !readyRef.current) {
      return Promise.resolve({ eval: { type: "cp", value: 0 }, bestMove: "0000" });
    }

    queueRef.current = queueRef.current.then(
      () =>
        new Promise<EngineResult>(async (resolve) => {
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
