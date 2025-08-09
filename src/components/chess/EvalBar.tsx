import React from "react";
import { EngineEval, mapEvalToCentipawns } from "@/engine/useStockfish";

interface EvalBarProps {
  evalNow?: EngineEval; // evaluation for current position from White's perspective
  heightPx?: number;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function evalToPercentWhite(evalNow?: EngineEval): number {
  if (!evalNow) return 50;
  if (evalNow.type === "mate") return evalNow.value > 0 ? 100 : 0;
  const cp = clamp(mapEvalToCentipawns(evalNow), -1000, 1000);
  // Map -1000..+1000 to 0..100
  return Math.round(50 + (cp / 1000) * 50);
}

export const EvalBar: React.FC<EvalBarProps> = ({ evalNow, heightPx = 560 }) => {
  const percentWhite = evalToPercentWhite(evalNow);
  const blackPercent = 100 - percentWhite;

  return (
    <div
      className="relative w-6 rounded-md overflow-hidden border bg-card"
      style={{ height: heightPx }}
      aria-label="Evaluation bar"
    >
      {/* Black advantage on top */}
      <div
        className="absolute top-0 left-0 w-full bg-foreground/90 transition-all duration-300"
        style={{ height: `${blackPercent}%` }}
      />
      {/* White advantage on bottom */}
      <div
        className="absolute bottom-0 left-0 w-full bg-background transition-all duration-300"
        style={{ height: `${percentWhite}%` }}
      />
      {/* Divider line */}
      <div className="absolute top-1/2 left-0 right-0 h-px bg-border" />
    </div>
  );
};
