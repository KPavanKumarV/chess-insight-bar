import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export type PieceType = 'p' | 'r' | 'n' | 'b' | 'q' | 'k' | 'P' | 'R' | 'N' | 'B' | 'Q' | 'K';

interface PieceSelectorProps {
  selectedPiece: PieceType | null;
  onPieceSelect: (piece: PieceType | null) => void;
}

const pieces: { piece: PieceType; symbol: string; name: string }[] = [
  { piece: 'P', symbol: '♙', name: 'White Pawn' },
  { piece: 'R', symbol: '♖', name: 'White Rook' },
  { piece: 'N', symbol: '♘', name: 'White Knight' },
  { piece: 'B', symbol: '♗', name: 'White Bishop' },
  { piece: 'Q', symbol: '♕', name: 'White Queen' },
  { piece: 'K', symbol: '♔', name: 'White King' },
  { piece: 'p', symbol: '♟', name: 'Black Pawn' },
  { piece: 'r', symbol: '♜', name: 'Black Rook' },
  { piece: 'n', symbol: '♞', name: 'Black Knight' },
  { piece: 'b', symbol: '♝', name: 'Black Bishop' },
  { piece: 'q', symbol: '♛', name: 'Black Queen' },
  { piece: 'k', symbol: '♚', name: 'Black King' },
];

export const PieceSelector: React.FC<PieceSelectorProps> = ({
  selectedPiece,
  onPieceSelect,
}) => {
  return (
    <Card className="mb-4">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Piece Selector</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-6 gap-2 mb-3">
          {pieces.map(({ piece, symbol, name }) => (
            <Button
              key={piece}
              variant={selectedPiece === piece ? "default" : "outline"}
              size="sm"
              className="h-12 text-2xl p-0"
              onClick={() => onPieceSelect(piece)}
              title={name}
            >
              {symbol}
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};