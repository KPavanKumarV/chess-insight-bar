import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

type PgnImportProps = {
  onLoad: (pgnText: string) => void;
};

export const PgnImport: React.FC<PgnImportProps> = ({ onLoad }) => {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);

  const handleFile = async (file: File) => {
    setLoading(true);
    try {
      const content = await file.text();
      setText(content);
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = () => {
    if (!text.trim()) return;
    onLoad(text);
  };

  return (
    <Card className="mb-4">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Import PGN</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 p-6">
        <div className="space-y-2">
          <Label htmlFor="pgn-text">Paste PGN</Label>
          <Textarea
            id="pgn-text"
            placeholder="Paste PGN here..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="min-h-[120px]"
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            id="pgn-file"
            type="file"
            accept=".pgn,text/plain"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
            className="flex-1 min-w-0"
          />
          <Button size="sm" variant="secondary" onClick={() => setText("")}>Clear</Button>
          <Button size="sm" onClick={onSubmit} disabled={loading || !text.trim()}>
            Load PGN
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
