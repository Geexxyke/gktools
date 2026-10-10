import { Button } from "@/components/ui/button";
import { useCallback, useEffect, useRef, useState } from "react";

export function BgRemover() {
  const [srcUrl, setSrcUrl] = useState<string | null>(null);
  const [cutUrl, setCutUrl] = useState<string | null>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [flipX, setFlipX] = useState(false);
  const [flipY, setFlipY] = useState(false);
  const [useCut, setUseCut] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const loadFile = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) return;
    setCutUrl(null);
    setUseCut(false);
    setStatus("");
    setFlipX(false);
    setFlipY(false);
    setSrcUrl(URL.createObjectURL(file));
  }, []);

  // load whichever source into an <img>
  useEffect(() => {
    const url = useCut && cutUrl ? cutUrl : srcUrl;
    if (!url) {
      setImg(null);
      return;
    }
    const i = new Image();
    i.onload = () => setImg(i);
    i.src = url;
  }, [srcUrl, cutUrl, useCut]);

  // render with flips (lossless: full resolution, no resampling)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !img) return;
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(flipX ? canvas.width : 0, flipY ? canvas.height : 0);
    ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0);
    ctx.restore();
  }, [img, flipX, flipY]);

  const removeBg = async () => {
    if (!srcUrl) return;
    setBusy(true);
    setStatus("Loading model…");
    try {
      const { removeBackground } = await import("@imgly/background-removal");
      const blob = await removeBackground(srcUrl, {
        output: { format: "image/png", quality: 1 },
        progress: (key, current, total) => {
          const pct = total ? Math.round((current / total) * 100) : 0;
          setStatus(`${key.startsWith("fetch") ? "Downloading" : "Processing"}: ${pct}%`);
        },
      });
      setCutUrl(URL.createObjectURL(blob));
      setUseCut(true);
      setStatus("Done — background removed (transparent PNG).");
    } catch (e) {
      setStatus("Error: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  };

  const download = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "gktools.png";
      a.click();
    }, "image/png");
  };

  return (
    <div className="editor-layout grid min-w-0 lg:grid-cols-[360px_minmax(0,1fr)] gap-4 sm:gap-6">
      <div className="editor-controls min-w-0 space-y-5 bg-card/60 border border-border rounded-lg p-4 sm:p-5">
        {!srcUrl ? (
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const f = e.dataTransfer.files?.[0];
              if (f) loadFile(f);
            }}
            className={`flex flex-col items-center justify-center gap-2 aspect-square w-full rounded-xl border-2 border-dashed cursor-pointer transition ${
              dragOver
                ? "border-primary bg-primary/10"
                : "border-border bg-background/40 hover:border-primary/60"
            }`}
          >
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) loadFile(f);
              }}
            />
            
            <p className="text-sm font-medium text-foreground">Drop an image here</p>
            <p className="text-xs text-muted-foreground">or click to browse</p>
          </label>
        ) : (
          <Button variant="plain" size="natural"
            onClick={() => {
              setSrcUrl(null);
              setCutUrl(null);
              setImg(null);
            }}
            className="w-full text-xs py-1.5 rounded-md border border-border hover:bg-accent text-muted-foreground"
          >
            Replace image
          </Button>
        )}

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider mb-2 text-muted-foreground">
            Background
          </label>
          <Button variant="plain" size="natural"
            onClick={removeBg}
            disabled={!srcUrl || busy}
            className="w-full py-2.5 rounded-lg text-sm font-bold border border-primary bg-primary/15 hover:bg-primary/25 disabled:opacity-40"
          >
            {busy ? "Working…" : "Remove background"}
          </Button>
          {cutUrl && (
            <div className="grid grid-cols-2 gap-2 mt-2">
              <Button variant="plain" size="natural"
                onClick={() => setUseCut(false)}
                className={`py-2 rounded-md text-xs font-semibold border transition ${
                  !useCut ? "bg-primary text-primary-foreground border-primary" : "bg-background/60 border-input hover:bg-accent"
                }`}
              >
                Original
              </Button>
              <Button variant="plain" size="natural"
                onClick={() => setUseCut(true)}
                className={`py-2 rounded-md text-xs font-semibold border transition ${
                  useCut ? "bg-primary text-primary-foreground border-primary" : "bg-background/60 border-input hover:bg-accent"
                }`}
              >
                Cutout
              </Button>
            </div>
          )}
          {status && (
            <p className="text-xs text-muted-foreground mt-2 leading-relaxed">{status}</p>
          )}
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider mb-2 text-muted-foreground">
            Mirror
          </label>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="plain" size="natural"
              onClick={() => setFlipX((v) => !v)}
              disabled={!img}
              className={`py-2 rounded-md text-xs font-semibold border transition disabled:opacity-40 ${
                flipX ? "bg-primary text-primary-foreground border-primary" : "bg-background/60 border-input hover:bg-accent"
              }`}
            >
              <div className="text-base">⇄</div>
              Horizontal
            </Button>
            <Button variant="plain" size="natural"
              onClick={() => setFlipY((v) => !v)}
              disabled={!img}
              className={`py-2 rounded-md text-xs font-semibold border transition disabled:opacity-40 ${
                flipY ? "bg-primary text-primary-foreground border-primary" : "bg-background/60 border-input hover:bg-accent"
              }`}
            >
              <div className="text-base">⇅</div>
              Vertical
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Horizontal mirroring flips the subject’s facing direction.
          </p>
        </div>

        <Button variant="plain" size="natural"
          onClick={download}
          disabled={!img}
          className="w-full py-3 rounded-xl font-bold text-primary-foreground bg-primary hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg"
        >
          Download PNG
        </Button>
      </div>

      <div className="editor-preview min-w-0 bg-card/40 border border-border rounded-lg p-3 sm:p-5 flex items-center justify-center min-h-48 sm:min-h-[400px]">
        {img ? (
          <canvas
            ref={canvasRef}
            className="max-w-full max-h-[75vh] object-contain rounded-md shadow-2xl"
            style={{
              backgroundImage:
                "linear-gradient(45deg,oklch(0.28 0 0) 25%,transparent 25%,transparent 75%,oklch(0.28 0 0) 75%),linear-gradient(45deg,oklch(0.28 0 0) 25%,transparent 25%,transparent 75%,oklch(0.28 0 0) 75%)",
              backgroundSize: "20px 20px",
              backgroundPosition: "0 0,10px 10px",
            }}
          />
        ) : (
          <p className="text-muted-foreground text-sm">
            Upload an image to see the preview here
          </p>
        )}
      </div>
    </div>
  );
}
