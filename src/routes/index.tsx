import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Mémgenerátor — Felső szöveg képhez" },
      { name: "description", content: "Tölts fel egy képet, adj hozzá fehér paddinget felül és írj rá Impact betűtípussal." },
    ],
  }),
  component: Index,
});

function Index() {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [text, setText] = useState("ÍRD IDE A SZÖVEGED");
  const [padding, setPadding] = useState(120);
  const [format, setFormat] = useState<"png" | "gif">("png");
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const img = new Image();
    img.onload = () => setImage(img);
    img.src = URL.createObjectURL(file);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = image.width;
    canvas.height = image.height + padding;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, padding);
    ctx.drawImage(image, 0, padding);

    const fontSize = Math.floor(padding * 0.55);
    ctx.fillStyle = "#000000";
    ctx.font = `900 ${fontSize}px Impact, "Anton", "Arial Black", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // word wrap
    const maxWidth = canvas.width * 0.95;
    const words = text.split(" ");
    const lines: string[] = [];
    let line = "";
    for (const w of words) {
      const test = line ? line + " " + w : w;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = w;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);

    const lineHeight = fontSize * 1.1;
    const totalHeight = lines.length * lineHeight;
    let y = padding / 2 - totalHeight / 2 + lineHeight / 2;
    for (const l of lines) {
      ctx.fillText(l, canvas.width / 2, y);
      y += lineHeight;
    }
  }, [image, text, padding]);

  const download = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (format === "png") {
      const link = document.createElement("a");
      link.download = "mem.png";
      link.href = canvas.toDataURL("image/png");
      link.click();
      return;
    }

    // GIF
    const GIF = (await import("gif.js")).default;
    const workerBlob = new Blob([
      `importScripts("https://cdn.jsdelivr.net/npm/gif.js@0.2.0/dist/gif.worker.js");`,
    ], { type: "application/javascript" });
    const workerUrl = URL.createObjectURL(workerBlob);

    const gif = new GIF({
      workers: 1,
      quality: 10,
      width: canvas.width,
      height: canvas.height,
      workerScript: workerUrl,
    });
    gif.addFrame(canvas, { delay: 200, copy: true });
    gif.on("finished", (blob: Blob) => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.download = "mem.gif";
      link.href = url;
      link.click();
      URL.revokeObjectURL(url);
      URL.revokeObjectURL(workerUrl);
    });
    gif.render();
  };

  return (
    <div className="min-h-screen bg-background py-10 px-4">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl md:text-5xl font-black tracking-tight mb-2 text-foreground">
          Mémgenerátor
        </h1>
        <p className="text-muted-foreground mb-8">
          Tölts fel egy képet, állítsd be a fehér sávot, írd be a szöveget, majd töltsd le.
        </p>

        <div className="grid md:grid-cols-[320px_1fr] gap-6">
          <div className="space-y-5 bg-card border border-border rounded-lg p-5">
            <div>
              <label className="block text-sm font-medium mb-2 text-foreground">Kép</label>
              <input
                type="file"
                accept="image/*"
                onChange={handleUpload}
                className="block w-full text-sm text-foreground file:mr-3 file:py-2 file:px-3 file:rounded-md file:border-0 file:bg-primary file:text-primary-foreground hover:file:opacity-90"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2 text-foreground">Szöveg</label>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={3}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2 text-foreground">
                Felső fehér sáv: {padding}px
              </label>
              <input
                type="range"
                min={40}
                max={400}
                value={padding}
                onChange={(e) => setPadding(Number(e.target.value))}
                className="w-full"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2 text-foreground">Formátum</label>
              <div className="flex gap-2">
                {(["png", "gif"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFormat(f)}
                    className={`flex-1 py-2 rounded-md text-sm font-medium border transition ${
                      format === f
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background text-foreground border-input hover:bg-accent"
                    }`}
                  >
                    {f.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={download}
              disabled={!image}
              className="w-full py-3 rounded-md bg-primary text-primary-foreground font-semibold hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Letöltés ({format.toUpperCase()})
            </button>
          </div>

          <div className="bg-card border border-border rounded-lg p-5 flex items-center justify-center min-h-[400px]">
            {image ? (
              <canvas
                ref={canvasRef}
                className="max-w-full max-h-[70vh] object-contain border border-border"
              />
            ) : (
              <p className="text-muted-foreground text-sm">Tölts fel egy képet a kezdéshez</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
