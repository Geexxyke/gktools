import { useCallback, useEffect, useRef, useState } from "react";
import GIF from "gif.js";

type Target = "gif";

export function FileConverter() {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [fileName, setFileName] = useState("kep");
  const [origSize, setOrigSize] = useState(0);
  const [origType, setOrigType] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [target] = useState<Target>("gif");
  const [maxWidth, setMaxWidth] = useState(0); // 0 = original
  const [quality, setQuality] = useState(10); // gif.js: lower = better
  const [transparentBg, setTransparentBg] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultSize, setResultSize] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const objUrlRef = useRef<string | null>(null);

  const loadFile = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("Only image files can be converted to GIF.");
      return;
    }
    setError(null);
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      setImage(img);
      setMaxWidth(0);
    };
    img.onerror = () => setError("Your browser cannot open this image format.");
    img.src = url;
    if (objUrlRef.current) URL.revokeObjectURL(objUrlRef.current);
    objUrlRef.current = url;
    setFileName(file.name.replace(/\.[^.]+$/, "") || "kep");
    setOrigSize(file.size);
    setOrigType(file.type || "image");
    setResultUrl(null);
  }, []);

  useEffect(() => () => { if (resultUrl) URL.revokeObjectURL(resultUrl); }, [resultUrl]);

  const convert = async () => {
    if (!image) return;
    setBusy(true);
    setResultUrl(null);
    setError(null);
    try {
      const scale = maxWidth > 0 && image.width > maxWidth ? maxWidth / image.width : 1;
      const w = Math.max(1, Math.round(image.width * scale));
      const h = Math.max(1, Math.round(image.height * scale));

      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      if (!transparentBg) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, w, h);
      }
      ctx.drawImage(image, 0, 0, w, h);

      const gif = new GIF({
        workers: 2,
        quality,
        width: w,
        height: h,
        workerScript: "/gif/gif.worker.js",
        ...(transparentBg ? { transparent: 0x000000 } : {}),
      });
      gif.addFrame(ctx.getImageData(0, 0, w, h), { delay: 100, copy: true });
      const blob = await new Promise<Blob>((res, rej) => {
        gif.on("finished", (b: Blob) => res(b));
        gif.on("abort", () => rej(new Error("Conversion was aborted.")));
        gif.render();
      });
      setResultUrl(URL.createObjectURL(blob));
      setResultSize(blob.size);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Conversion failed.");
    } finally {
      setBusy(false);
    }
  };

  const download = () => {
    if (!resultUrl) return;
    const a = document.createElement("a");
    a.href = resultUrl;
    a.download = `${fileName}.${target}`;
    a.click();
  };

  return (
    <div className="grid lg:grid-cols-[360px_1fr] gap-6">
      <div className="space-y-5 bg-card/60 backdrop-blur border border-border rounded-2xl p-5">
        {!image ? (
          <label
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) loadFile(f); }}
            className={`flex flex-col items-center justify-center gap-2 aspect-square w-full rounded-xl border-2 border-dashed cursor-pointer transition ${
              dragOver ? "border-primary bg-primary/10" : "border-border bg-background/40 hover:border-primary/60"
            }`}
          >
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) loadFile(f); }}
            />
            <div className="text-5xl">🔄</div>
            <p className="text-sm font-medium text-foreground">Drop your image here</p>
            <p className="text-xs text-muted-foreground">PNG, JPG, WEBP, BMP, SVG…</p>
          </label>
        ) : (
          <div className="space-y-2">
            <div className="aspect-video w-full rounded-xl overflow-hidden border border-border bg-background/40 flex items-center justify-center">
              <img src={image.src} alt="Uploaded image preview" className="max-h-full max-w-full object-contain" />
            </div>
            <div className="text-xs text-muted-foreground flex justify-between">
              <span>{image.width}×{image.height} · {origType}</span>
              <span>{fmtSize(origSize)}</span>
            </div>
            <button
              onClick={() => { setImage(null); setResultUrl(null); }}
              className="w-full text-xs py-1.5 rounded-md border border-border hover:bg-accent text-muted-foreground"
            >
              Change file
            </button>
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider mb-2 text-muted-foreground">Target format</label>
          <div className="flex gap-2">
            <button className="flex-1 py-2 rounded-md text-sm font-semibold border bg-primary text-primary-foreground border-primary">GIF</button>
            <span className="flex-1 py-2 rounded-md text-sm font-semibold border border-input text-muted-foreground text-center opacity-50">More soon</span>
          </div>
        </div>

        <div>
          <div className="flex justify-between items-baseline mb-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Max width</label>
            <span className="text-sm font-mono">{maxWidth === 0 ? "original" : `${maxWidth}px`}</span>
          </div>
          <input
            type="range" min={0} max={2000} step={20}
            value={maxWidth}
            onChange={(e) => setMaxWidth(Number(e.target.value))}
            className="w-full"
          />
        </div>

        <div>
          <div className="flex justify-between items-baseline mb-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Color accuracy</label>
            <span className="text-sm font-mono">{quality <= 5 ? "high" : quality <= 12 ? "medium" : "fast"}</span>
          </div>
          <input
            type="range" min={1} max={20} step={1}
            value={21 - quality}
            onChange={(e) => setQuality(21 - Number(e.target.value))}
            className="w-full"
          />
          <p className="text-[11px] text-muted-foreground mt-1">GIF supports up to 256 colors — a more accurate palette means a larger file.</p>
        </div>

        <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
          <input type="checkbox" checked={transparentBg} onChange={(e) => setTransparentBg(e.target.checked)} />
          Keep transparency (otherwise white background)
        </label>

        <button
          onClick={convert}
          disabled={!image || busy}
          className="w-full py-3 rounded-xl font-bold text-primary-foreground bg-gradient-to-r from-[oklch(0.72_0.28_340)] via-[oklch(0.65_0.27_295)] to-[oklch(0.82_0.18_200)] hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg"
        >
          {busy ? "Converting…" : "Convert to GIF"}
        </button>

        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>

      <div className="bg-card/40 backdrop-blur border border-border rounded-2xl p-5 flex flex-col items-center justify-center min-h-[400px] gap-4">
        {resultUrl ? (
          <>
            <img src={resultUrl} alt="Converted GIF" className="max-w-full max-h-[60vh] object-contain rounded-md shadow-2xl" />
            <div className="text-sm text-muted-foreground">
              GIF size: <span className="font-mono text-foreground">{fmtSize(resultSize)}</span>
            </div>
            <button
              onClick={download}
              className="px-6 py-3 rounded-xl font-bold text-primary-foreground bg-gradient-to-r from-[oklch(0.72_0.28_340)] via-[oklch(0.65_0.27_295)] to-[oklch(0.82_0.18_200)] hover:opacity-90 shadow-lg"
            >
              Download GIF
            </button>
          </>
        ) : (
          <p className="text-muted-foreground text-sm text-center">
            {image ? "Start the conversion from the panel on the left." : "Upload an image to get started."}
          </p>
        )}
      </div>
    </div>
  );
}

function fmtSize(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(2)} MB`;
}
