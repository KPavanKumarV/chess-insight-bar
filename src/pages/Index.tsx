import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Chess, Square } from "chess.js";
import { Chessboard } from "react-chessboard";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { EvalBar } from "@/components/chess/EvalBar";
import { MoveList, MoveRecord, MoveCategory } from "@/components/chess/MoveList";
import { EngineEval, useStockfish, mapEvalToCentipawns } from "@/engine/useStockfish";

// Helpers
function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function uciToSan(baseFen: string, uci: string): string | undefined {
  try {
    const game = new Chess(baseFen);
    const from = uci.slice(0, 2) as Square;
    const to = uci.slice(2, 4) as Square;
    const promo = uci.length > 4 ? (uci[4] as any) : undefined;
    const move = game.move({ from, to, promotion: promo || "q" });
    return move?.san;
  } catch {
    return undefined;
  }
}

function materialBalanceCp(fen: string): number {
  const pieceValues: Record<string, number> = {
    p: 100,
    n: 320,
    b: 330,
    r: 500,
    q: 900,
    k: 0,
  };
  const [board] = fen.split(" ");
  let white = 0;
  let black = 0;
  for (const c of board) {
    if (c === "/" || c === " ") continue;
    if (/[1-8]/.test(c)) continue;
    if (c === c.toUpperCase()) white += pieceValues[c.toLowerCase()] || 0;
    else black += pieceValues[c] || 0;
  }
  return white - black; // in centipawns
}

function categorizeMove(
  evalBefore: EngineEval,
  evalAfter: EngineEval,
  playedIsBest: boolean,
  moveWasSac: boolean,
  ply: number
): MoveCategory {
  // Theory heuristic: first 12 plies, small eval swing
  const beforeCp = mapEvalToCentipawns(evalBefore);
  const afterCp = mapEvalToCentipawns(evalAfter);
  const delta = afterCp - beforeCp; // positive means better for side to move (white perspective)
  const loss = -delta; // loss from the perspective of the side that played (approx)

  if (ply <= 12 && Math.abs(afterCp - beforeCp) < 40 && playedIsBest) {
    return "Theory";
  }

  if (playedIsBest) {
    if (moveWasSac && delta > 100) return "Brilliant";
    if (delta > 100) return "Great";
    return "Good";
  }

  const absLoss = Math.abs(loss);
  if (absLoss >= 300) return "Blunder";
  if (absLoss >= 100) return "Mistake";
  if (absLoss >= 50) return "Inaccuracy";
  return "Good";
}

const Index: React.FC = () => {
  const isMobile = useIsMobile();
  const [game, setGame] = useState(() => new Chess());
  const [depth, setDepth] = useState(14);
  const { analyze } = useStockfish();
  const [moves, setMoves] = useState<MoveRecord[]>([]);
  const [currentEval, setCurrentEval] = useState<EngineEval | undefined>(undefined);
  const [currentBestMove, setCurrentBestMove] = useState<string | undefined>(undefined);
  const [orientation, setOrientation] = useState<"white" | "black">("white");
  const [analyzing, setAnalyzing] = useState(false);
  const analyzingCountRef = useRef(0);

  const boardSize = useMemo(() => (isMobile ? 320 : 560), [isMobile]);

  // Analyze current position continuously (best move + eval)
  const analyzeCurrentPosition = useCallback(async () => {
    analyzingCountRef.current += 1;
    setAnalyzing(true);
    try {
      const res = await analyze(game.fen(), depth);
      setCurrentEval(res.eval);
      setCurrentBestMove(res.bestMove);
    } finally {
      analyzingCountRef.current -= 1;
      setAnalyzing(analyzingCountRef.current > 0);
    }
  }, [analyze, game, depth]);

  useEffect(() => {
    analyzeCurrentPosition();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.fen(), depth]);

  const onDrop = useCallback(
    (sourceSquare: Square, targetSquare: Square, _piece: string) => {
      const moveBeforeEval = currentEval;
      const preBestMove = currentBestMove;
      const preFen = game.fen();
      const next = new Chess(preFen);
      const move = next.move({ from: sourceSquare, to: targetSquare, promotion: "q" });
      if (!move) return false;

      // Compute quick sacrifice heuristic via material change
      const beforeMat = materialBalanceCp(preFen);
      const afterMat = materialBalanceCp(next.fen());
      const sacrificial = (move.color === "w" ? afterMat - beforeMat : beforeMat - afterMat) < 0;

      // Update board state
      setGame(next);

      // Create a temporary move record immediately
      const ply = next.history().length; // after pushing
      const moveNumber = Math.ceil(ply / 2);
      const tempRec: MoveRecord = {
        ply,
        moveNumber,
        color: move.color as "w" | "b",
        san: move.san,
        uci: `${move.from}${move.to}${move.promotion || ""}`,
        fenAfter: next.fen(),
      };
      setMoves((prev) => [...prev, tempRec]);

      // Fire-and-forget engine analysis (before & after)
      (async () => {
        const fallback = { eval: { type: "cp", value: 0 } as EngineEval, bestMove: "0000" };
        const resBefore = (await analyze(preFen, depth).catch(() => fallback));
        const resAfter = (await analyze(next.fen(), depth).catch(() => fallback));
        const playedIsBest = resBefore.bestMove.slice(0, 4) === `${move.from}${move.to}`.toLowerCase();
        const bestSan = uciToSan(preFen, resBefore.bestMove);

        setMoves((prev) =>
          prev.map((m) =>
            m.ply === ply
              ? {
                  ...m,
                  evalBeforeCp: mapEvalToCentipawns(resBefore.eval),
                  evalAfterCp: mapEvalToCentipawns(resAfter.eval),
                  bestMoveUci: resBefore.bestMove,
                  bestMoveSan: bestSan,
                  category: categorizeMove(resBefore.eval, resAfter.eval, !!playedIsBest, sacrificial, ply),
                }
              : m
          )
        );

        setCurrentEval(resAfter.eval);
        setCurrentBestMove(resAfter.bestMove);
      })();

      return true;
    },
    [analyze, currentBestMove, currentEval, depth, game]
  );

  const onReset = useCallback(() => {
    const fresh = new Chess();
    setGame(fresh);
    setMoves([]);
  }, []);

  const onUndo = useCallback(() => {
    const g = new Chess(game.fen());
    g.undo();
    setGame(g);
    setMoves((prev) => prev.slice(0, -1));
  }, [game]);

  const bestMoveSanNow = useMemo(() => {
    if (!currentBestMove) return undefined;
    return uciToSan(game.fen(), currentBestMove);
  }, [currentBestMove, game]);

  const sideToMove = game.turn() === "w" ? "White" : "Black";

  return (
    <>
      <Helmet>
        <title>Chess Analysis & Engine | Live Evaluation</title>
        <meta
          name="description"
          content="Play and analyze chess with a built-in Stockfish engine. Live evaluation bar, best moves for both sides, and annotated move list."
        />
        <link rel="canonical" href="/" />
      </Helmet>

      <main className="min-h-screen bg-background">
        <section className="container py-8">
          <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Chess Analysis Board</h1>
              <p className="text-muted-foreground">Powered by Stockfish • Depth {depth}</p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={() => setOrientation((o) => (o === "white" ? "black" : "white"))}>
                Flip
              </Button>
              <Button variant="secondary" onClick={onUndo} disabled={moves.length === 0}>
                Undo
              </Button>
              <Button onClick={onReset}>New Game</Button>
            </div>
          </header>

          <Card className="mb-6">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Engine Controls</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <span className="text-sm text-muted-foreground">Depth</span>
                <div className="flex-1">
                  <Slider
                    value={[depth]}
                    min={8}
                    max={22}
                    step={1}
                    onValueChange={(v) => setDepth(clamp(v[0], 8, 22))}
                  />
                </div>
                <span className="w-10 text-right text-sm tabular-nums">{depth}</span>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
            {/* Eval bar */}

            {/* Board + status */}
            <div className="flex flex-col items-center gap-4">
              <div className="w-full">
                <div className="flex items-center justify-center lg:justify-start gap-3">
                  <EvalBar evalNow={currentEval} analyzing={analyzing} heightPx={boardSize} />
                  <div className="max-w-[min(100%,700px)]">
                    <div className="rounded-xl border bg-card p-3 shadow-sm">
                      <Chessboard
                        position={game.fen()}
                        onPieceDrop={onDrop}
                        boardWidth={boardSize}
                        customBoardStyle={{ borderRadius: 12 }}
                        customDarkSquareStyle={{ backgroundColor: "hsl(var(--chess-dark-square))" }}
                        customLightSquareStyle={{ backgroundColor: "hsl(var(--chess-light-square))" }}
                        arePiecesDraggable={true}
                        animationDuration={200}
                        boardOrientation={orientation}
                        showBoardNotation={true}
                      />
                    </div>
                  </div>
                </div>
              </div>
              <div className="w-full max-w-[min(100%,700px)]">
                <Card>
                  <CardContent className="pt-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="text-sm text-muted-foreground">
                        To move: <span className="font-semibold text-foreground">{sideToMove}</span>
                      </div>
                      <div className="text-sm">
                        {currentEval && (
                          <span className="text-muted-foreground">
                            Eval: <span className="tabular-nums">{(mapEvalToCentipawns(currentEval) / 100).toFixed(2)}</span>
                          </span>
                        )}
                      </div>
                    </div>
                    <Separator className="my-3" />
                    <div className="text-sm">
                      {bestMoveSanNow ? (
                        <span className="text-muted-foreground">
                          Best move now: <span className="font-medium text-foreground">{bestMoveSanNow}</span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Calculating best move…</span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* Moves list */}
            <aside className="min-h-[200px]">
              <h2 className="mb-3 text-lg font-semibold">Move List</h2>
              <MoveList moves={moves} />
            </aside>
          </div>
        </section>
      </main>
    </>
  );
};

export default Index;
