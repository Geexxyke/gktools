import { useCallback, useEffect, useRef, useState } from "react";

type Mode = "blur" | "pixelate" | "black";
type Region = { x: number; y: number; w: number; h: number; mode: Mode; intensity: number };

export function FaceBlur() {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [regions, setRegions] = useState<Region[]>([]);
  const [mode, setMode] = useState<Mode>("blur");
  const [intensity, setIntensity] = useState(20);
  const [dragOver, setDragOver] = useState(false);
  const [drawing, setDrawing] = useState<Region | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const loadFile = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) return;
    const img = new Image();
    img.onload = () => {
      setImage(img);
      setRegions([]);
    };
    img.src = URL.createObjectURL(file);
  }, []);

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) loadFile(f);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) loadFile(f);
  };

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = image.width;
    canvas.height = image.height;
    ctx.drawImage(image, 0, 0);

    const all = drawing ? [...regions, drawing] : regions;
    for (const r of all) {
      const x = Math.min(r.x, r.x + r.w);
      const y = Math.min(r.y, r.y + r.h);
      const w = Math.abs(r.w);
      const h = Math.abs(r.h);
      if (w < 2 || h < 2) continue;

      if (r.mode === "black") {
        ctx.fillStyle = "#000";
        ctx.fillRect(x, y, w, h);
      } else if (r.mode === "pixelate") {
        const size = Math.max(2, Math.round((Math.min(w, h) / 100) * r.intensity));
        const tmp = document.createElement("canvas");
        const tw = Math.max(1, Math.floor(w / size));
        const th = Math.max(1, Math.floor(h / size));
        tmp.width = tw;
        tmp.height = th;
        const tctx = tmp.getContext("2d")!;
        tctx.imageSmoothingEnabled = false;
        tctx.drawImage(canvas, x, y, w, h, 0, 0, tw, th);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(tmp, 0, 0, tw, th, x, y, w, h);
        ctx.imageSmoothingEnabled = true;
      } else {
        const tmp = document.createElement("canvas");
        tmp.width = w;
        tmp.height = h;
        const tctx = tmp.getContext("2d")!;
        tctx.filter = `blur(${r.intensity}px)`;
        tctx.drawImage(canvas, x, y, w, h, 0, 0, w, h);
        ctx.drawImage(tmp, x, y);
      }
    }
  }, [image, regions, drawing]);

  useEffect(() => { render(); }, [render]);

  const getPos = (e: React.PointerEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  };

  const onDown = (e: React.PointerEvent) => {
    if (!image) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    const p = getPos(e);
    setDrawing({ x: p.x, y: p.y, w: 0, h: 0, mode, intensity });
  };

  const onMove = (e: React.PointerEvent) => {
    if (!drawing) return;
    const p = getPos(e);
    setDrawing({ ...drawing, w: p.x - drawing.x, h: p.y - drawing.y });
  };

  const onUp = () => {
    if (!drawing) return;
    if (Math.abs(drawing.w) > 4 && Math.abs(drawing.h) > 4) {
      setRegions((r) => [...r, drawing]);
    }
    setDrawing(null);
  };

  const undo = () => setRegions((r) => r.slice(0, -1));
  const clear = () => setRegions([]);

  const download = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = "kitakarva.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  return (
    <div className="grid lg:grid-cols-[360px_1fr] gap-6">
      <div className="space-y-5 bg-card/60 backdrop-blur border border-border rounded-2xl p-5">
        {!image ? (
          <label
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            className={`flex flex-col items-center justify-center gap-2 aspect-square w-full rounded-xl border-2 border-dashed cursor-pointer transition ${
              dragOver ? "border-primary bg-primary/10" : "border-border bg-background/40 hover:border-primary/60"
            }`}
          >
            <input type="file" accept="image/*" onChange={onFile} className="hidden" />
            <div className="text-5xl">🫥</div>
            <p className="text-sm font-medium text-foreground">Húzd ide a képet</p>
            <p className="text-xs text-muted-foreground">vagy kattints a tallózáshoz</p>
          </label>
        ) : (
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground bg-background/40 border border-border rounded-lg p-3 leading-relaxed">
              Rajzolj téglalapot a képen az arc vagy bármilyen részlet kitakarásához.
            </div>
            <button
              onClick={() => { setImage(null); setRegions([]); }}
              className="w-full text-xs py-1.5 rounded-md border border-border hover:bg-accent text-muted-foreground"
            >
              Másik kép
            </button>
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider mb-2 text-muted-foreground">Eszköz</label>
          <div className="grid grid-cols-3 gap-2">
            {([
              { id: "blur", label: "Homály", icon: "💨" },
              { id: "pixelate", label: "Pixel", icon: "🔲" },
              { id: "black", label: "Sáv", icon: "⬛" },
            ] as const).map((m) => (
              <button
                key={m.id}
                onClick={() => setMode(m.id)}
                className={`py-2 rounded-md text-xs font-semibold border transition ${
                  mode === m.id
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background/60 border-input hover:bg-accent"
                }`}
              >
                <div className="text-base">{m.icon}</div>
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {mode !== "black" && (
          <div>
            <div className="flex justify-between items-baseline mb-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Erősség</label>
              <span className="text-sm font-mono">{intensity}</span>
            </div>
            <input
              type="range"
              min={2}
              max={60}
              value={intensity}
              onChange={(e) => setIntensity(Number(e.target.value))}
              className="w-full accent-[oklch(0.7_0.25_330)]"
            />
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={undo}
            disabled={regions.length === 0}
            className="py-2 rounded-md border border-border hover:bg-accent text-sm font-semibold disabled:opacity-40"
          >
            ↶ Vissza
          </button>
          <button
            onClick={clear}
            disabled={regions.length === 0}
            className="py-2 rounded-md border border-border hover:bg-accent text-sm font-semibold disabled:opacity-40"
          >
            Töröl
          </button>
        </div>

        <button
          onClick={download}
          disabled={!image}
          className="w-full py-3 rounded-xl font-bold text-primary-foreground bg-gradient-to-r from-[oklch(0.72_0.28_340)] via-[oklch(0.65_0.27_295)] to-[oklch(0.82_0.18_200)] hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg"
        >
          ⬇ Letöltés (PNG)
        </button>
      </div>

      <div ref={containerRef} className="bg-card/40 backdrop-blur border border-border rounded-2xl p-5 flex items-center justify-center min-h-[400px]">
        {image ? (
          <canvas
            ref={canvasRef}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            className="max-w-full max-h-[75vh] object-contain rounded-md shadow-2xl cursor-crosshair touch-none"
          />
        ) : (
          <p className="text-muted-foreground text-sm">A kép feltöltése után itt jelenik meg az előnézet</p>
        )}
      </div>
    </div>
  );
}
