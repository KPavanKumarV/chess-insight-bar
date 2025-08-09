import React from "react";
import { Badge } from "@/components/ui/badge";

export type MoveCategory =
  | "Theory"
  | "Brilliant"
  | "Great"
  | "Good"
  | "Inaccuracy"
  | "Mistake"
  | "Blunder";

export interface MoveRecord {
  ply: number;
  moveNumber: number; // 1-based full move number
  color: "w" | "b";
  san: string;
  uci: string;
  fenAfter: string;
  evalBeforeCp?: number; // centipawns (mate -> big value)
  evalAfterCp?: number;
  bestMoveUci?: string;
  bestMoveSan?: string;
  category?: MoveCategory;
}

function categoryColor(category?: MoveCategory) {
  switch (category) {
    case "Brilliant":
      return "bg-accent text-accent-foreground";
    case "Great":
      return "bg-primary text-primary-foreground";
    case "Good":
      return "bg-secondary text-secondary-foreground";
    case "Inaccuracy":
      return "bg-muted text-muted-foreground";
    case "Mistake":
      return "bg-accent text-accent-foreground";
    case "Blunder":
      return "bg-destructive text-destructive-foreground";
    case "Theory":
      return "bg-card text-foreground";
    default:
      return "bg-muted text-muted-foreground";
  }
}

export const MoveList: React.FC<{
  moves: MoveRecord[];
}> = ({ moves }) => {
  // Group moves by full move number
  const grouped = moves.reduce<Record<number, MoveRecord[]>>((acc, m) => {
    acc[m.moveNumber] = acc[m.moveNumber] || [];
    acc[m.moveNumber].push(m);
    return acc;
  }, {});

  const rows = Object.keys(grouped)
    .map((n) => parseInt(n, 10))
    .sort((a, b) => a - b)
    .map((moveNumber) => ({ moveNumber, pair: grouped[moveNumber] }));

  return (
    <div className="h-full overflow-auto pr-2">
      <div className="space-y-3">
        {rows.map(({ moveNumber, pair }) => (
          <div
            key={moveNumber}
            className="flex flex-col gap-2 rounded-lg border bg-card p-3 shadow-sm"
          >
            <div className="text-sm font-medium opacity-70">{moveNumber}.</div>
            <div className="grid grid-cols-1 gap-2">
              {pair
                .sort((a, b) => (a.color === "w" ? -1 : 1))
                .map((m, idx) => (
                  <div
                    key={idx}
                    className="flex items-start justify-between gap-3"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="text-sm font-semibold truncate">{m.san}</span>
                      {m.bestMoveSan && m.bestMoveSan !== m.san && (
                        <span className="truncate text-xs text-muted-foreground">
                          best: {m.bestMoveSan}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={categoryColor(m.category)}>
                        {m.category || "Good"}
                      </Badge>
                      {typeof m.evalAfterCp === "number" && (
                        <span className="text-xs tabular-nums text-muted-foreground">
                          eval: {(m.evalAfterCp / 100).toFixed(2)}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
