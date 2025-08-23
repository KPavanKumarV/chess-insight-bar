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
import { PgnImport } from "@/components/chess/PgnImport";
import { PieceSelector, PieceType } from "@/components/chess/PieceSelector";

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
  ply: number,
  playerColor: "w" | "b"
): MoveCategory {
  // Theory heuristic: first 12 plies, small eval swing
  const beforeCp = mapEvalToCentipawns(evalBefore);
  const afterCp = mapEvalToCentipawns(evalAfter);
  
  // Calculate evaluation change from the perspective of the player who moved
  // Evaluations are always from White's perspective, so we need to flip for Black
  const evalChange = playerColor === "w" ? (afterCp - beforeCp) : (beforeCp - afterCp);
  const evalLoss = Math.max(0, -evalChange); // How much the player lost by this move

  if (ply <= 12 && Math.abs(afterCp - beforeCp) < 40 && playedIsBest) {
    return "Theory";
  }

  if (playedIsBest) {
    if (moveWasSac && evalChange > 100) return "Brilliant";
    if (evalChange > 100) return "Great";
    return "Good";
  }

  // Categorize based on evaluation loss
  if (evalLoss >= 300) return "Blunder";
  if (evalLoss >= 100) return "Mistake";  
  if (evalLoss >= 50) return "Inaccuracy";
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
  const [setupMode, setSetupMode] = useState(false);
  const [selectedPiece, setSelectedPiece] = useState<PieceType | null>(null);

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
                  category: categorizeMove(resBefore.eval, resAfter.eval, !!playedIsBest, sacrificial, ply, move.color),
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
    setSetupMode(false);
  }, []);

  const onClearBoard = useCallback(() => {
    // Create an empty board FEN (no pieces, white to move)
    const emptyFen = "8/8/8/8/8/8/8/8 w - - 0 1";
    try {
      const emptyGame = new Chess(emptyFen);
      setGame(emptyGame);
      setMoves([]);
      setSetupMode(true);
    } catch (error) {
      console.error("Error creating empty board:", error);
    }
  }, []);

  const onUndo = useCallback(() => {
    if (setupMode) return; // Don't allow undo in setup mode
    if (moves.length === 0) return;
    
    // Get the previous position by replaying all moves except the last one
    const newGame = new Chess();
    const movesToReplay = moves.slice(0, -1);
    
    for (const moveRecord of movesToReplay) {
      try {
        const move = newGame.move({
          from: moveRecord.uci.slice(0, 2) as Square,
          to: moveRecord.uci.slice(2, 4) as Square,
          promotion: moveRecord.uci.length > 4 ? (moveRecord.uci[4] as any) : undefined
        });
        if (!move) {
          console.error("Failed to replay move:", moveRecord);
          return;
        }
      } catch (error) {
        console.error("Error replaying move:", moveRecord, error);
        return;
      }
    }
    
    setGame(newGame);
    setMoves((prev) => prev.slice(0, -1));
  }, [moves, setupMode]);

  const onSquareClick = useCallback((square: Square) => {
    if (!setupMode || selectedPiece === null) return;

    try {
      const currentFen = game.fen();
      const fenParts = currentFen.split(' ');
      const boardPart = fenParts[0];
      
      // Convert FEN board to 2D array
      const rows = boardPart.split('/');
      const board: (string | null)[][] = [];
      
      for (let i = 0; i < 8; i++) {
        const row: (string | null)[] = [];
        const rowStr = rows[i];
        for (let j = 0; j < rowStr.length; j++) {
          const char = rowStr[j];
          if (/[1-8]/.test(char)) {
            // Empty squares
            const emptyCount = parseInt(char);
            for (let k = 0; k < emptyCount; k++) {
              row.push(null);
            }
          } else {
            // Piece
            row.push(char);
          }
        }
        board.push(row);
      }

      // Get square coordinates (a1 = [7,0], h8 = [0,7])
      const file = square.charCodeAt(0) - 'a'.charCodeAt(0); // 0-7
      const rank = parseInt(square[1]) - 1; // 0-7
      const boardRow = 7 - rank; // Flip rank for board array index
      
      // Place piece
      board[boardRow][file] = selectedPiece;

      // Convert back to FEN
      let newBoardPart = '';
      for (let i = 0; i < 8; i++) {
        let rowStr = '';
        let emptyCount = 0;
        
        for (let j = 0; j < 8; j++) {
          if (board[i][j] === null) {
            emptyCount++;
          } else {
            if (emptyCount > 0) {
              rowStr += emptyCount.toString();
              emptyCount = 0;
            }
            rowStr += board[i][j];
          }
        }
        
        if (emptyCount > 0) {
          rowStr += emptyCount.toString();
        }
        
        newBoardPart += rowStr;
        if (i < 7) newBoardPart += '/';
      }

      // Keep other FEN parts the same
      const newFen = `${newBoardPart} ${fenParts[1]} ${fenParts[2]} ${fenParts[3]} ${fenParts[4]} ${fenParts[5]}`;
      
      const newGame = new Chess(newFen);
      setGame(newGame);
    } catch (error) {
      console.error("Error placing piece:", error);
    }
  }, [setupMode, selectedPiece, game]);

  const onSetupPieceDrop = useCallback((sourceSquare: Square, targetSquare: Square, piece: string) => {
    if (!setupMode) return false;
    
    try {
      const currentFen = game.fen();
      const fenParts = currentFen.split(' ');
      const boardPart = fenParts[0];
      
      // Convert FEN board to 2D array
      const rows = boardPart.split('/');
      const board: (string | null)[][] = [];
      
      for (let i = 0; i < 8; i++) {
        const row: (string | null)[] = [];
        const rowStr = rows[i];
        for (let j = 0; j < rowStr.length; j++) {
          const char = rowStr[j];
          if (/[1-8]/.test(char)) {
            const emptyCount = parseInt(char);
            for (let k = 0; k < emptyCount; k++) {
              row.push(null);
            }
          } else {
            row.push(char);
          }
        }
        board.push(row);
      }

      // Remove piece from source square
      const sourceFile = sourceSquare.charCodeAt(0) - 'a'.charCodeAt(0);
      const sourceRank = parseInt(sourceSquare[1]) - 1;
      const sourceBoardRow = 7 - sourceRank;
      board[sourceBoardRow][sourceFile] = null;

      // Check if target is a valid square (a1-h8)
      const isValidTarget = /^[a-h][1-8]$/.test(targetSquare);
      
      if (isValidTarget) {
        // Place piece on target square
        const targetFile = targetSquare.charCodeAt(0) - 'a'.charCodeAt(0);
        const targetRank = parseInt(targetSquare[1]) - 1;
        const targetBoardRow = 7 - targetRank;
        board[targetBoardRow][targetFile] = piece;
      }
      // If not valid target, piece is removed (dragged off board)

      // Convert back to FEN
      let newBoardPart = '';
      for (let i = 0; i < 8; i++) {
        let rowStr = '';
        let emptyCount = 0;
        
        for (let j = 0; j < 8; j++) {
          if (board[i][j] === null) {
            emptyCount++;
          } else {
            if (emptyCount > 0) {
              rowStr += emptyCount.toString();
              emptyCount = 0;
            }
            rowStr += board[i][j];
          }
        }
        
        if (emptyCount > 0) {
          rowStr += emptyCount.toString();
        }
        
        newBoardPart += rowStr;
        if (i < 7) newBoardPart += '/';
      }

      const newFen = `${newBoardPart} ${fenParts[1]} ${fenParts[2]} ${fenParts[3]} ${fenParts[4]} ${fenParts[5]}`;
      const newGame = new Chess(newFen);
      setGame(newGame);
      return true;
    } catch (error) {
      console.error("Error moving piece in setup:", error);
      return false;
    }
  }, [setupMode, game]);
  const onImportPgn = useCallback((pgnText: string) => {
    try {
      const g = new Chess();
      
      // Try to load the PGN using chess.js loadPgn method
      g.loadPgn(pgnText, { strict: false });

      // Check for custom starting position (FEN tag)
      const fenMatch = pgnText.match(/\[FEN\s+"([^"]+)"\]/i);
      const startFen = fenMatch?.[1];
      
      // Get all moves that were played
      const verboseMoves = g.history({ verbose: true }) as Array<any>;
      
      // Create a new game from the starting position
      const temp = new Chess(startFen || undefined);
      const records: MoveRecord[] = [];
      let ply = 0;
      
      // Replay all moves to build our move list
      for (const m of verboseMoves) {
        ply += 1;
        temp.move({ from: m.from, to: m.to, promotion: m.promotion || "q" });
        const moveNumber = Math.ceil(ply / 2);
        records.push({
          ply,
          moveNumber,
          color: m.color,
          san: m.san,
          uci: `${m.from}${m.to}${m.promotion || ""}`,
          fenAfter: temp.fen(),
        });
      }
      
      // Update game state with final position
      setGame(temp);
      setMoves(records);
      console.log(`Loaded PGN with ${records.length} moves`);
    } catch (error) {
      console.error("Error loading PGN:", error);
    }
  }, []);

  const bestMoveSanNow = useMemo(() => {
    if (!currentBestMove) return undefined;
    return uciToSan(game.fen(), currentBestMove);
  }, [currentBestMove, game]);

  const sideToMove = game.turn() === "w" ? "White" : "Black";

  return (
    <>
      <Helmet>
        <title>Chess Insight Bar - Advanced Chess Analysis Engine</title>
        <meta
          name="description"
          content="Professional chess analysis platform powered by Stockfish engine. Analyze positions, import PGN files, and get real-time evaluations with move categorization."
        />
        <link rel="canonical" href="/" />
      </Helmet>

      <div className="min-h-screen bg-background app-gradient">
        {/* Navigation */}
        <nav className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="container flex h-16 items-center">
            <div className="mr-4 flex">
              <h1 className="text-xl font-bold">Chess Insight Bar</h1>
            </div>
            <div className="flex flex-1 items-center justify-between space-x-2 md:justify-end">
              <div className="w-full flex-1 md:w-auto md:flex-none">
                <p className="text-sm text-muted-foreground">Professional Chess Analysis Platform</p>
              </div>
            </div>
          </div>
        </nav>

        {/* Hero Section */}
        <header className="border-b bg-gradient-to-b from-background to-muted/20">
          <div className="container py-12">
            <div className="mx-auto max-w-4xl text-center">
              <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">
                Advanced Chess Analysis
              </h1>
              <p className="mt-6 text-lg leading-8 text-muted-foreground">
                Analyze your chess games with professional-grade Stockfish engine. 
                Import PGN files, get real-time evaluations, and improve your play with detailed move analysis.
              </p>
              <div className="mt-6 flex items-center justify-center gap-4 text-sm text-muted-foreground">
                <span>✨ Powered by Stockfish {depth}</span>
                <span>📊 Real-time Evaluation</span>
                <span>📁 PGN Import</span>
              </div>
            </div>
          </div>
        </header>

        <main className="container py-8">
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">Analysis Board</h2>
              <p className="text-muted-foreground">Drag and drop pieces to analyze positions</p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={() => setOrientation((o) => (o === "white" ? "black" : "white"))}>
                Flip Board
              </Button>
              <Button 
                variant={setupMode ? "default" : "secondary"} 
                onClick={() => setSetupMode(!setupMode)}
              >
                {setupMode ? "Play Mode" : "Setup Mode"}
              </Button>
              <Button variant="secondary" onClick={onClearBoard}>
                Clear Board
              </Button>
              <Button variant="secondary" onClick={onUndo} disabled={moves.length === 0 || setupMode}>
                Undo Move
              </Button>
              <Button onClick={onReset}>New Game</Button>
            </div>
          </div>

          {setupMode && (
            <PieceSelector 
              selectedPiece={selectedPiece}
              onPieceSelect={setSelectedPiece}
            />
          )}

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
                        onPieceDrop={setupMode ? onSetupPieceDrop : onDrop}
                        onSquareClick={setupMode ? onSquareClick : undefined}
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
                        {setupMode ? (
                          <span className="font-semibold text-primary">Setup Mode: Click squares to place pieces</span>
                        ) : (
                          <>To move: <span className="font-semibold text-foreground">{sideToMove}</span></>
                        )}
                      </div>
                      <div className="text-sm">
                        {currentEval && !setupMode && (
                          <span className="text-muted-foreground">
                            Eval: <span className="tabular-nums">{(mapEvalToCentipawns(currentEval) / 100).toFixed(2)}</span>
                          </span>
                        )}
                      </div>
                    </div>
                    <Separator className="my-3" />
                    {!setupMode && (
                      <div className="text-sm">
                        {bestMoveSanNow ? (
                          <span className="text-muted-foreground">
                            Best move now: <span className="font-medium text-foreground">{bestMoveSanNow}</span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground">Calculating best move…</span>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* Moves list */}
            <aside className="min-h-[200px]">
              <PgnImport onLoad={onImportPgn} />
              <h2 className="mb-3 text-lg font-semibold">Move List</h2>
              <MoveList moves={moves} />
            </aside>
          </div>
        </main>

        {/* Footer */}
        <footer className="border-t bg-background">
          <div className="container py-8">
            <div className="grid gap-8 md:grid-cols-3">
              <div>
                <h3 className="text-lg font-semibold">Chess Insight Bar</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Professional chess analysis platform for players of all levels.
                </p>
              </div>
              <div>
                <h4 className="text-sm font-medium">Features</h4>
                <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                  <li>Stockfish Engine Analysis</li>
                  <li>PGN Import & Export</li>
                  <li>Real-time Evaluation</li>
                  <li>Move Categorization</li>
                </ul>
              </div>
              <div>
                <h4 className="text-sm font-medium">Analysis</h4>
                <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                  <li>Position Evaluation</li>
                  <li>Best Move Suggestions</li>
                  <li>Blunder Detection</li>
                  <li>Opening Theory</li>
                </ul>
              </div>
            </div>
            <div className="mt-8 border-t pt-8 text-center text-sm text-muted-foreground">
              <p>&copy; 2024 Chess Insight Bar. Empowering chess players worldwide.</p>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
};

export default Index;
