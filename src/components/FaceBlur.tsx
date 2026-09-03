import { useCallback, useEffect, useRef, useState } from "react";

type Mode = "blur" | "pixelate" | "black";
type Shape = "rect" | "brush";

type RectRegion = {
  kind: "rect";
  x: number;
  y: number;
  w: number;
  h: number;
  mode: Mode;
  intensity: number;
};
type BrushRegion = {
  kind: "brush";
  points: { x: number; y: number }[];
  size: number;
  mode: Mode;
  intensity: number;
};
type Region = RectRegion | BrushRegion;

export function FaceBlur() {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [regions, setRegions] = useState<Region[]>([]);
  const [mode, setMode] = useState<Mode>("pixelate");
  const [shape, setShape] = useState<Shape>("brush");
  const [intensity, setIntensity] = useState(28);
  const [brushSize, setBrushSize] = useState(80);
  const [dragOver, setDragOver] = useState(false);
  const [drawing, setDrawing] = useState<Region | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

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

  const applyClip = (ctx: CanvasRenderingContext2D, r: Region) => {
    ctx.beginPath();
    if (r.kind === "rect") {
      const x = Math.min(r.x, r.x + r.w);
      const y = Math.min(r.y, r.y + r.h);
      ctx.rect(x, y, Math.abs(r.w), Math.abs(r.h));
    } else {
      const rad = r.size / 2;
      for (const p of r.points) {
        ctx.moveTo(p.x + rad, p.y);
        ctx.arc(p.x, p.y, rad, 0, Math.PI * 2);
      }
    }
    ctx.clip();
  };

  const renderBlurLayer = (
    src: HTMLCanvasElement,
    intensity: number,
  ): HTMLCanvasElement => {
    // Stronger blur: downscale heavily, then upscale, plus CSS filter blur on top
    const scale = Math.max(0.02, Math.min(0.5, 8 / intensity));
    const tmp = document.createElement("canvas");
    tmp.width = Math.max(1, Math.floor(src.width * scale));
    tmp.height = Math.max(1, Math.floor(src.height * scale));
    const tctx = tmp.getContext("2d")!;
    tctx.imageSmoothingEnabled = true;
    tctx.imageSmoothingQuality = "high";
    tctx.drawImage(src, 0, 0, tmp.width, tmp.height);

    const out = document.createElement("canvas");
    out.width = src.width;
    out.height = src.height;
    const octx = out.getContext("2d")!;
    octx.filter = `blur(${Math.max(4, intensity / 2)}px)`;
    octx.imageSmoothingEnabled = true;
    octx.imageSmoothingQuality = "high";
    octx.drawImage(tmp, 0, 0, out.width, out.height);
    return out;
  };

  const renderPixelLayer = (
    src: HTMLCanvasElement,
    intensity: number,
  ): HTMLCanvasElement => {
    // intensity controls block size in CSS pixels of the source canvas
    const block = Math.max(6, Math.round(intensity));
    const cols = Math.ceil(src.width / block);
    const rows = Math.ceil(src.height / block);

    // downscale to one pixel per block (averages colors)
    const tmp = document.createElement("canvas");
    tmp.width = cols;
    tmp.height = rows;
    const tctx = tmp.getContext("2d")!;
    tctx.imageSmoothingEnabled = true;
    tctx.imageSmoothingQuality = "high";
    tctx.drawImage(src, 0, 0, cols, rows);

    // upscale aligned to grid, no smoothing -> chunky blocks
    const out = document.createElement("canvas");
    out.width = src.width;
    out.height = src.height;
    const octx = out.getContext("2d")!;
    octx.imageSmoothingEnabled = false;
    octx.drawImage(tmp, 0, 0, cols * block, rows * block);
    return out;
  };

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = image.width;
    canvas.height = image.height;
    ctx.drawImage(image, 0, 0);

    // base snapshot for sampling (so effects sample the original image, not stacked effects)
    const base = document.createElement("canvas");
    base.width = canvas.width;
    base.height = canvas.height;
    base.getContext("2d")!.drawImage(image, 0, 0);

    const all = drawing ? [...regions, drawing] : regions;
    for (const r of all) {
      ctx.save();
      applyClip(ctx, r);

      if (r.mode === "black") {
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      } else if (r.mode === "pixelate") {
        const layer = renderPixelLayer(base, r.intensity);
        ctx.drawImage(layer, 0, 0);
      } else {
        const layer = renderBlurLayer(base, r.intensity);
        ctx.drawImage(layer, 0, 0);
      }
      ctx.restore();
    }
  }, [image, regions, drawing]);

  useEffect(() => {
    render();
  }, [render]);

  const getPos = (e: React.PointerEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const onDown = (e: React.PointerEvent) => {
    if (!image) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    const p = getPos(e);
    if (shape === "rect") {
      setDrawing({ kind: "rect", x: p.x, y: p.y, w: 0, h: 0, mode, intensity });
    } else {
      setDrawing({
        kind: "brush",
        points: [p],
        size: brushSize,
        mode,
        intensity,
      });
    }
  };

  const onMove = (e: React.PointerEvent) => {
    if (!drawing) return;
    const p = getPos(e);
    if (drawing.kind === "rect") {
      setDrawing({ ...drawing, w: p.x - drawing.x, h: p.y - drawing.y });
    } else {
      // sample densely so the stroke is continuous
      const last = drawing.points[drawing.points.length - 1];
      const dx = p.x - last.x;
      const dy = p.y - last.y;
      const dist = Math.hypot(dx, dy);
      const step = Math.max(2, drawing.size / 6);
      const pts = [...drawing.points];
      if (dist > step) {
        const n = Math.floor(dist / step);
        for (let i = 1; i <= n; i++) {
          pts.push({ x: last.x + (dx * i) / n, y: last.y + (dy * i) / n });
        }
      } else {
        pts.push(p);
      }
      setDrawing({ ...drawing, points: pts });
    }
  };

  const onUp = () => {
    if (!drawing) return;
    if (drawing.kind === "rect") {
      if (Math.abs(drawing.w) > 4 && Math.abs(drawing.h) > 4) {
        setRegions((r) => [...r, drawing]);
      }
    } else if (drawing.points.length > 0) {
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
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            className={`flex flex-col items-center justify-center gap-2 aspect-square w-full rounded-xl border-2 border-dashed cursor-pointer transition ${
              dragOver
                ? "border-primary bg-primary/10"
                : "border-border bg-background/40 hover:border-primary/60"
            }`}
          >
            <input
              type="file"
              accept="image/*"
              onChange={onFile}
              className="hidden"
            />
            <div className="text-5xl">🫥</div>
            <p className="text-sm font-medium text-foreground">
              Drop your image here
            </p>
            <p className="text-xs text-muted-foreground">
              or click to browse
            </p>
          </label>
        ) : (
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground bg-background/40 border border-border rounded-lg p-3 leading-relaxed">
              {shape === "brush"
                ? "Paint over the image like a brush — adjust the circle size below."
                : "Drag a rectangle over the area you want to redact."}
            </div>
            <button
              onClick={() => {
                setImage(null);
                setRegions([]);
              }}
              className="w-full text-xs py-1.5 rounded-md border border-border hover:bg-accent text-muted-foreground"
            >
              Change image
            </button>
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider mb-2 text-muted-foreground">
            Alakzat
          </label>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                { id: "brush", label: "Brush (circle)", icon: "⚪" },
                { id: "rect", label: "Rectangle", icon: "▭" },
              ] as const
            ).map((s) => (
              <button
                key={s.id}
                onClick={() => setShape(s.id)}
                className={`py-2 rounded-md text-xs font-semibold border transition ${
                  shape === s.id
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background/60 border-input hover:bg-accent"
                }`}
              >
                <div className="text-base">{s.icon}</div>
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider mb-2 text-muted-foreground">
            Tool
          </label>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                { id: "blur", label: "Blur", icon: "💨" },
                { id: "pixelate", label: "Pixel", icon: "🔲" },
                { id: "black", label: "Bar", icon: "⬛" },
              ] as const
            ).map((m) => (
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

        {shape === "brush" && (
          <div>
            <div className="flex justify-between items-baseline mb-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Brush size
              </label>
              <span className="text-sm font-mono">{brushSize}px</span>
            </div>
            <input
              type="range"
              min={10}
              max={300}
              value={brushSize}
              onChange={(e) => setBrushSize(Number(e.target.value))}
              className="w-full accent-[oklch(0.7_0.25_330)]"
            />
          </div>
        )}

        {mode !== "black" && (
          <div>
            <div className="flex justify-between items-baseline mb-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {mode === "blur" ? "Blur strength" : "Pixel size"}
              </label>
              <span className="text-sm font-mono">{intensity}</span>
            </div>
            <input
              type="range"
              min={mode === "blur" ? 10 : 8}
              max={mode === "blur" ? 120 : 80}
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
            Clear
          </button>
        </div>

        <button
          onClick={download}
          disabled={!image}
          className="w-full py-3 rounded-xl font-bold text-primary-foreground bg-gradient-to-r from-[oklch(0.72_0.28_340)] via-[oklch(0.65_0.27_295)] to-[oklch(0.82_0.18_200)] hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg"
        >
          Download PNG
        </button>
      </div>

      <div className="bg-card/40 backdrop-blur border border-border rounded-2xl p-5 flex items-center justify-center min-h-[400px]">
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
          <p className="text-muted-foreground text-sm">
            The preview appears here once you upload an image
          </p>
        )}
      </div>
    </div>
  );
}
