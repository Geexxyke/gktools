import { useCallback, useEffect, useRef, useState } from "react";
import GIF from "gif.js";
import gifuct from "gifuct-js";
const { parseGIF, decompressFrames } = gifuct as any;

type Mode = "compress" | "resize";
type ResizeFormat = "png" | "jpg" | "gif";

export function ImageCompressor() {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [fileName, setFileName] = useState("kep");
  const [origSize, setOrigSize] = useState(0);
  const [mode, setMode] = useState<Mode>("compress");
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultSize, setResultSize] = useState(0);
  const [resultExt, setResultExt] = useState("jpg");

  // compress
  const [targetMb, setTargetMb] = useState(1);

  // resize
  const [width, setWidth] = useState(800);
  const [height, setHeight] = useState(600);
  const [lockRatio, setLockRatio] = useState(true);
  const [resizeFormat, setResizeFormat] = useState<ResizeFormat>("png");

  const ratioRef = useRef(1);
  const sourceFileRef = useRef<File | null>(null);
  const isGifRef = useRef(false);
  const [isGif, setIsGif] = useState(false);

  const loadFile = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) return;
    const gif = file.type === "image/gif" || /\.gif$/i.test(file.name);
    sourceFileRef.current = file;
    isGifRef.current = gif;
    setIsGif(gif);
    const img = new Image();
    img.onload = () => {
      setImage(img);
      setWidth(img.width);
      setHeight(img.height);
      ratioRef.current = img.width / img.height;
    };
    img.src = URL.createObjectURL(file);
    setFileName(file.name.replace(/\.[^.]+$/, "") || "kep");
    setOrigSize(file.size);
    setResultUrl(null);
    if (gif) setResizeFormat("gif");
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

  useEffect(() => () => { if (resultUrl) URL.revokeObjectURL(resultUrl); }, [resultUrl]);

  const drawToCanvas = (w: number, h: number) => {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(w));
    canvas.height = Math.max(1, Math.round(h));
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(image!, 0, 0, canvas.width, canvas.height);
    return canvas;
  };

  const canvasToBlob = (canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> =>
    new Promise((res, rej) => canvas.toBlob((b) => b ? res(b) : rej(new Error("blob fail")), type, quality));

  const handleCompress = async () => {
    if (!image) return;
    setBusy(true);
    setResultUrl(null);
    try {
      const targetBytes = targetMb * 1024 * 1024;
      // Binary search on quality, then scale down if needed.
      let scale = 1;
      let best: Blob | null = null;
      for (let attempt = 0; attempt < 6; attempt++) {
        const canvas = drawToCanvas(image.width * scale, image.height * scale);
        let lo = 0.05, hi = 0.95;
        let candidate: Blob | null = null;
        for (let i = 0; i < 8; i++) {
          const q = (lo + hi) / 2;
          const blob = await canvasToBlob(canvas, "image/jpeg", q);
          if (blob.size > targetBytes) {
            hi = q;
          } else {
            candidate = blob;
            lo = q;
          }
        }
        if (candidate) { best = candidate; break; }
        // even at min quality too big -> scale down
        scale *= 0.75;
      }
      if (!best) {
        const canvas = drawToCanvas(image.width * scale, image.height * scale);
        best = await canvasToBlob(canvas, "image/jpeg", 0.05);
      }
      const url = URL.createObjectURL(best);
      setResultUrl(url);
      setResultSize(best.size);
      setResultExt("jpg");
    } finally {
      setBusy(false);
    }
  };

  const resizeGif = async (targetW: number, targetH: number): Promise<Blob> => {
    const file = sourceFileRef.current!;
    const buf = await file.arrayBuffer();
    const parsed = parseGIF(buf);
    const frames = decompressFrames(parsed, true);
    const srcW = (parsed as any).lsd.width;
    const srcH = (parsed as any).lsd.height;

    // Composite each frame respecting disposal onto a full-size canvas
    const full = document.createElement("canvas");
    full.width = srcW; full.height = srcH;
    const fctx = full.getContext("2d")!;
    const patchCanvas = document.createElement("canvas");
    const pctx = patchCanvas.getContext("2d")!;

    const out = document.createElement("canvas");
    out.width = targetW; out.height = targetH;
    const octx = out.getContext("2d")!;
    octx.imageSmoothingEnabled = true;
    octx.imageSmoothingQuality = "high";

    const gif = new GIF({
      workers: 2,
      quality: 10,
      width: targetW,
      height: targetH,
      workerScript: "/gif/gif.worker.js",
    });

    let prevImageData: ImageData | null = null;
    for (const f of frames) {
      const { width: fw, height: fh, top, left } = f.dims;
      if (f.disposalType === 3 && prevImageData) {
        fctx.putImageData(prevImageData, 0, 0);
      } else if (f.disposalType === 2) {
        fctx.clearRect(left, top, fw, fh);
      }
      if (f.disposalType === 3) {
        prevImageData = fctx.getImageData(0, 0, srcW, srcH);
      }
      patchCanvas.width = fw; patchCanvas.height = fh;
      const imgData = pctx.createImageData(fw, fh);
      imgData.data.set(f.patch);
      pctx.putImageData(imgData, 0, 0);
      fctx.drawImage(patchCanvas, left, top);

      octx.clearRect(0, 0, targetW, targetH);
      octx.drawImage(full, 0, 0, targetW, targetH);
      gif.addFrame(octx.getImageData(0, 0, targetW, targetH), { delay: f.delay || 100, copy: true });
    }

    return new Promise<Blob>((resolve, reject) => {
      gif.on("finished", (b: Blob) => resolve(b));
      gif.on("abort", () => reject(new Error("gif aborted")));
      gif.render();
    });
  };

  const handleResize = async () => {
    if (!image) return;
    setBusy(true);
    setResultUrl(null);
    try {
      let blob: Blob;
      const w = Math.max(1, Math.round(width));
      const h = Math.max(1, Math.round(height));
      if (resizeFormat === "gif") {
        if (!isGifRef.current) {
          // Static image → single-frame GIF
          const canvas = drawToCanvas(w, h);
          const ctx = canvas.getContext("2d")!;
          const gif = new GIF({
            workers: 1, quality: 10, width: w, height: h,
            workerScript: "/gif/gif.worker.js",
          });
          gif.addFrame(ctx.getImageData(0, 0, w, h), { delay: 100, copy: true });
          blob = await new Promise<Blob>((res, rej) => {
            gif.on("finished", (b: Blob) => res(b));
            gif.on("abort", () => rej(new Error("gif aborted")));
            gif.render();
          });
        } else {
          blob = await resizeGif(w, h);
        }
      } else {
        const canvas = drawToCanvas(w, h);
        const type = resizeFormat === "png" ? "image/png" : "image/jpeg";
        blob = await canvasToBlob(canvas, type, resizeFormat === "jpg" ? 0.92 : undefined);
      }
      const url = URL.createObjectURL(blob);
      setResultUrl(url);
      setResultSize(blob.size);
      setResultExt(resizeFormat);
    } finally {
      setBusy(false);
    }
  };

  const onWidth = (w: number) => {
    setWidth(w);
    if (lockRatio) setHeight(Math.round(w / ratioRef.current));
  };
  const onHeight = (h: number) => {
    setHeight(h);
    if (lockRatio) setWidth(Math.round(h * ratioRef.current));
  };

  const download = () => {
    if (!resultUrl) return;
    const link = document.createElement("a");
    link.href = resultUrl;
    link.download = `${fileName}-${mode === "compress" ? `${targetMb}mb` : `${width}x${height}`}.${resultExt}`;
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
            <div className="text-5xl">📁</div>
            <p className="text-sm font-medium text-foreground">Húzd ide a képet</p>
            <p className="text-xs text-muted-foreground">vagy kattints a tallózáshoz</p>
          </label>
        ) : (
          <div className="space-y-2">
            <div className="aspect-video w-full rounded-xl overflow-hidden border border-border bg-background/40 flex items-center justify-center">
              <img src={image.src} alt="" className="max-h-full max-w-full object-contain" />
            </div>
            <div className="text-xs text-muted-foreground flex justify-between">
              <span>{image.width}×{image.height}</span>
              <span>{fmtSize(origSize)}</span>
            </div>
            <button
              onClick={() => { setImage(null); setResultUrl(null); }}
              className="w-full text-xs py-1.5 rounded-md border border-border hover:bg-accent text-muted-foreground"
            >
              Másik kép
            </button>
          </div>
        )}

        <div className="flex gap-2">
          {(["compress", "resize"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`flex-1 py-2 rounded-md text-sm font-semibold border transition ${
                mode === m ? "bg-primary text-primary-foreground border-primary" : "bg-background/60 border-input hover:bg-accent"
              }`}
            >
              {m === "compress" ? "Tömörítés" : "Resize"}
            </button>
          ))}
        </div>

        {mode === "compress" ? (
          <>
            <div>
              <div className="flex justify-between items-baseline mb-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Cél méret</label>
                <span className="text-sm font-mono">{targetMb} MB</span>
              </div>
              <input
                type="range" min={0.05} max={20} step={0.05}
                value={targetMb}
                onChange={(e) => setTargetMb(Number(e.target.value))}
                className="w-full accent-[oklch(0.7_0.25_330)]"
              />
              <input
                type="number" min={0.05} step={0.05}
                value={targetMb}
                onChange={(e) => setTargetMb(Math.max(0.01, Number(e.target.value) || 0))}
                className="mt-2 w-full rounded-md border border-input bg-background/60 px-3 py-2 text-sm"
              />
              <p className="text-[11px] text-muted-foreground mt-1">JPEG-be konvertál a pontos méretért.</p>
            </div>
            <button
              onClick={handleCompress}
              disabled={!image || busy}
              className="w-full py-3 rounded-xl font-bold text-primary-foreground bg-gradient-to-r from-[oklch(0.72_0.28_340)] via-[oklch(0.65_0.27_295)] to-[oklch(0.82_0.18_200)] hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg"
            >
              {busy ? "Tömörítés…" : "🗜️ Tömörítés"}
            </button>
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              <NumField label="Szélesség" value={width} onChange={onWidth} />
              <NumField label="Magasság" value={height} onChange={onHeight} />
            </div>
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
              <input type="checkbox" checked={lockRatio} onChange={(e) => setLockRatio(e.target.checked)} />
              Arány megtartása
            </label>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider mb-2 text-muted-foreground">Formátum</label>
              <div className="flex gap-2">
                {(["png", "jpg", "gif"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setResizeFormat(f)}
                    className={`flex-1 py-2 rounded-md text-sm font-semibold border transition ${
                      resizeFormat === f ? "bg-primary text-primary-foreground border-primary" : "bg-background/60 border-input hover:bg-accent"
                    }`}
                  >{f.toUpperCase()}</button>
                ))}
              </div>
              {isGif && resizeFormat !== "gif" && (
                <p className="text-[11px] text-amber-400/80 mt-1.5">Animált GIF-nél csak GIF formátum tartja meg az animációt.</p>
              )}
            </div>
            <button
              onClick={handleResize}
              disabled={!image || busy}
              className="w-full py-3 rounded-xl font-bold text-primary-foreground bg-gradient-to-r from-[oklch(0.72_0.28_340)] via-[oklch(0.65_0.27_295)] to-[oklch(0.82_0.18_200)] hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg"
            >
              {busy ? "Átméretezés…" : "📐 Átméretezés"}
            </button>
          </>
        )}
      </div>

      <div className="bg-card/40 backdrop-blur border border-border rounded-2xl p-5 flex flex-col items-center justify-center min-h-[400px] gap-4">
        {resultUrl ? (
          <>
            <img src={resultUrl} alt="" className="max-w-full max-h-[60vh] object-contain rounded-md shadow-2xl" />
            <div className="text-sm text-muted-foreground">
              Új méret: <span className="font-mono text-foreground">{fmtSize(resultSize)}</span>
              {origSize > 0 && mode === "compress" && (
                <> &nbsp;·&nbsp; -{Math.max(0, Math.round((1 - resultSize / origSize) * 100))}%</>
              )}
            </div>
            <button
              onClick={download}
              className="px-6 py-3 rounded-xl font-bold text-primary-foreground bg-gradient-to-r from-[oklch(0.72_0.28_340)] via-[oklch(0.65_0.27_295)] to-[oklch(0.82_0.18_200)] hover:opacity-90 shadow-lg"
            >
              ⬇ Letöltés ({resultExt.toUpperCase()})
            </button>
          </>
        ) : (
          <p className="text-muted-foreground text-sm text-center">
            {image ? "Indítsd el a műveletet a bal oldalon." : "Tölts fel egy képet a kezdéshez."}
          </p>
        )}
      </div>
    </div>
  );
}

function NumField({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5 text-muted-foreground">{label}</label>
      <div className="relative">
        <input
          type="number" min={1}
          value={value}
          onChange={(e) => onChange(Math.max(1, Number(e.target.value) || 1))}
          className="w-full rounded-md border border-input bg-background/60 px-3 py-2 pr-8 text-sm"
        />
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">px</span>
      </div>
    </div>
  );
}

function fmtSize(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(2)} MB`;
}
