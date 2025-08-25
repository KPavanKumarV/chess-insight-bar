import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface SetupControlsProps {
  turn: 'w' | 'b';
  onTurnChange: (turn: 'w' | 'b') => void;
  castlingRights: {
    whiteKingside: boolean;
    whiteQueenside: boolean;
    blackKingside: boolean;
    blackQueenside: boolean;
  };
  onCastlingChange: (rights: {
    whiteKingside: boolean;
    whiteQueenside: boolean;
    blackKingside: boolean;
    blackQueenside: boolean;
  }) => void;
  fen: string;
  onFenChange: (fen: string) => void;
  onStartEvaluation: () => void;
  onClearBoard: () => void;
}

export const SetupControls: React.FC<SetupControlsProps> = ({
  turn,
  onTurnChange,
  castlingRights,
  onCastlingChange,
  fen,
  onFenChange,
  onStartEvaluation,
  onClearBoard,
}) => {
  return (
    <Card className="mb-4">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Position Setup</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Turn Selection */}
        <div className="space-y-2">
          <Label>Turn to Move</Label>
          <Select value={turn} onValueChange={(value: 'w' | 'b') => onTurnChange(value)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="w">White to move</SelectItem>
              <SelectItem value="b">Black to move</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Castling Rights */}
        <div className="space-y-3">
          <Label>Castling Rights</Label>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">White</Label>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="white-kingside"
                  checked={castlingRights.whiteKingside}
                  onCheckedChange={(checked) =>
                    onCastlingChange({
                      ...castlingRights,
                      whiteKingside: checked as boolean,
                    })
                  }
                />
                <Label htmlFor="white-kingside" className="text-sm">O-O</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="white-queenside"
                  checked={castlingRights.whiteQueenside}
                  onCheckedChange={(checked) =>
                    onCastlingChange({
                      ...castlingRights,
                      whiteQueenside: checked as boolean,
                    })
                  }
                />
                <Label htmlFor="white-queenside" className="text-sm">O-O-O</Label>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Black</Label>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="black-kingside"
                  checked={castlingRights.blackKingside}
                  onCheckedChange={(checked) =>
                    onCastlingChange({
                      ...castlingRights,
                      blackKingside: checked as boolean,
                    })
                  }
                />
                <Label htmlFor="black-kingside" className="text-sm">O-O</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="black-queenside"
                  checked={castlingRights.blackQueenside}
                  onCheckedChange={(checked) =>
                    onCastlingChange({
                      ...castlingRights,
                      blackQueenside: checked as boolean,
                    })
                  }
                />
                <Label htmlFor="black-queenside" className="text-sm">O-O-O</Label>
              </div>
            </div>
          </div>
        </div>

        {/* FEN Input */}
        <div className="space-y-2">
          <Label htmlFor="fen-input">FEN Position</Label>
          <Input
            id="fen-input"
            value={fen}
            onChange={(e) => onFenChange(e.target.value)}
            placeholder="8/8/8/8/8/8/8/8 w - - 0 1"
            className="font-mono text-sm"
          />
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-2">
          <Button onClick={onClearBoard} variant="outline" size="sm">
            Clear Board
          </Button>
          <Button onClick={onStartEvaluation} variant="default" size="sm">
            Start Evaluation
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};