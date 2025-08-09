// Lightweight Stockfish hook with a simple analysis queue
// Uses the "stockfish" npm package (web worker under the hood)

import { useRef } from "react";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import stockfish from "stockfish";

export type EngineEval = { type: "cp" | "mate"; value: number };
export type EngineResult = {
  eval: EngineEval;
  bestMove: string; // UCI (e.g., e2e4)
  pv?: string;
};

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
  return sign * 100000; // treat mate as decisive
}

export function useStockfish() {
  const engineRef = useRef<Worker | null>(null);
  const readyRef = useRef<Promise<void> | null>(null);
  const queueRef = useRef<Promise<EngineResult>>(
    Promise.resolve({ eval: { type: "cp", value: 0 }, bestMove: "0000" })
  );

  if (!engineRef.current) {
    const engine: Worker = (stockfish as any)();
    engineRef.current = engine;

    // Prepare a readiness promise
    readyRef.current = new Promise<void>((resolve) => {
      const onMsg = (e: MessageEvent<string>) => {
        const text = typeof e.data === "string" ? e.data : "";
        if (text.includes("uciok")) {
          engine.removeEventListener("message", onMsg);
          // Some basic options (optional)
          engine.postMessage("isready");
          resolve();
        }
      };
      engine.addEventListener("message", onMsg);
      engine.postMessage("uci");
    });
  }

  const analyze = (fen: string, depth = 14): Promise<EngineResult> => {
    queueRef.current = queueRef.current.then(
      () =>
        new Promise<EngineResult>(async (resolve) => {
          const engine = engineRef.current!;
          await readyRef.current!;

          let lastEval: EngineEval = { type: "cp", value: 0 };
          let lastPv: string | undefined;

          const onMessage = (e: MessageEvent<string>) => {
            const text = typeof e.data === "string" ? e.data : "";
            if (text.startsWith("info ")) {
              const parsed = parseInfoLine(text);
              if (parsed) {
                lastEval = parsed.eval;
                lastPv = parsed.pv;
              }
            } else if (text.startsWith("bestmove ")) {
              const bestMove = text.split(" ")[1];
              engine.removeEventListener("message", onMessage);
              resolve({ eval: lastEval, bestMove, pv: lastPv });
            }
          };

          engine.addEventListener("message", onMessage);

          engine.postMessage("ucinewgame");
          engine.postMessage(`position fen ${fen}`);
          engine.postMessage(`go depth ${depth}`);
        })
    );

    return queueRef.current;
  };

  return { analyze };
}
