import { useCallback, useEffect, useRef, useState } from "react";

type Format = "png" | "gif";

export function MemeGenerator() {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [text, setText] = useState("YOUR TEXT HERE");
  const [padding, setPadding] = useState(200);
  const [fontSize, setFontSize] = useState(90);
  const [fontWeight, setFontWeight] = useState(900);
  const [textColor, setTextColor] = useState("#000000");
  const [strokeColor, setStrokeColor] = useState("#ffffff");
  const [strokeWidth, setStrokeWidth] = useState(0);
  const [bgColor, setBgColor] = useState("#ffffff");
  const [format, setFormat] = useState<Format>("png");
  const [dragOver, setDragOver] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const loadFile = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) return;
    const img = new Image();
    img.onload = () => setImage(img);
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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = image.width;
    canvas.height = image.height + padding;

    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, canvas.width, padding);
    ctx.drawImage(image, 0, padding);

    // scale font size relative to image width for consistency
    const scaled = Math.floor((fontSize / 100) * (canvas.width / 10));
    ctx.fillStyle = textColor;
    ctx.font = `${fontWeight} ${scaled}px Impact, "Anton", "Arial Black", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.miterLimit = 2;

    const maxWidth = canvas.width * 0.94;
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

    const lineHeight = scaled * 1.1;
    const total = lines.length * lineHeight;
    let y = padding / 2 - total / 2 + lineHeight / 2;
    for (const l of lines) {
      if (strokeWidth > 0) {
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = strokeWidth;
        ctx.strokeText(l, canvas.width / 2, y);
      }
      ctx.fillText(l, canvas.width / 2, y);
      y += lineHeight;
    }
  }, [image, text, padding, fontSize, fontWeight, textColor, strokeColor, strokeWidth, bgColor]);

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

    const GIF = (await import("gif.js")).default;

    const gif = new GIF({
      workers: 1,
      quality: 10,
      width: canvas.width,
      height: canvas.height,
      workerScript: "/gif/gif.worker.js",
    });
    gif.addFrame(canvas, { delay: 200, copy: true });
    gif.on("finished", (blob: Blob) => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.download = "mem.gif";
      link.href = url;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    });
    gif.render();
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
              dragOver
                ? "border-primary bg-primary/10"
                : "border-border bg-background/40 hover:border-primary/60"
            }`}
          >
            <input type="file" accept="image/*" onChange={onFile} className="hidden" />
            <div className="text-5xl">📁</div>
            <p className="text-sm font-medium text-foreground">Drop your image here</p>
            <p className="text-xs text-muted-foreground">or click to browse</p>
          </label>
        ) : (
          <div className="space-y-2">
            <div className="aspect-video w-full rounded-xl overflow-hidden border border-border bg-background/40 flex items-center justify-center">
              <img src={image.src} alt="" className="max-h-full max-w-full object-contain" />
            </div>
            <button
              onClick={() => setImage(null)}
              className="w-full text-xs py-1.5 rounded-md border border-border hover:bg-accent text-muted-foreground"
            >
              Change image
            </button>
          </div>
        )}

        <Field label="Text">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            className="w-full rounded-md border border-input bg-background/60 px-3 py-2 text-sm"
          />
        </Field>

        <Slider label="White bar" value={padding} min={40} max={1200} step={20} onChange={setPadding} unit="px" />
        <Slider label="Font size" value={fontSize} min={30} max={250} step={5} onChange={setFontSize} unit="%" />
        <Slider label="Weight" value={fontWeight} min={100} max={900} step={100} onChange={setFontWeight} />
        <Slider label="Outline" value={strokeWidth} min={0} max={30} step={1} onChange={setStrokeWidth} unit="px" />

        <div className="grid grid-cols-3 gap-2">
          <ColorPick label="Text" value={textColor} onChange={setTextColor} />
          <ColorPick label="Outline" value={strokeColor} onChange={setStrokeColor} />
          <ColorPick label="Bar" value={bgColor} onChange={setBgColor} />
        </div>

        <Field label="Format">
          <div className="flex gap-2">
            {(["png", "gif"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFormat(f)}
                className={`flex-1 py-2 rounded-md text-sm font-semibold border transition ${
                  format === f
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background/60 border-input hover:bg-accent"
                }`}
              >
                {f.toUpperCase()}
              </button>
            ))}
          </div>
        </Field>

        <button
          onClick={download}
          disabled={!image}
          className="w-full py-3 rounded-xl font-bold text-primary-foreground bg-gradient-to-r from-[oklch(0.72_0.28_340)] via-[oklch(0.65_0.27_295)] to-[oklch(0.82_0.18_200)] hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg"
        >
          Download ({format.toUpperCase()})
        </button>
      </div>

      <div className="bg-card/40 backdrop-blur border border-border rounded-2xl p-5 flex items-center justify-center min-h-[400px]">
        {image ? (
          <canvas
            ref={canvasRef}
            className="max-w-full max-h-[75vh] object-contain rounded-md shadow-2xl"
          />
        ) : (
          <p className="text-muted-foreground text-sm">The preview appears here once you upload an image</p>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-wider mb-2 text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

function Slider({
  label, value, min, max, step = 1, onChange, unit = "",
}: { label: string; value: number; min: number; max: number; step?: number; onChange: (n: number) => void; unit?: string }) {
  return (
    <div>
      <div className="flex justify-between items-baseline mb-1.5">
        <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</label>
        <span className="text-sm font-mono text-foreground">{value}{unit}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[oklch(0.7_0.25_330)]"
      />
    </div>
  );
}

function ColorPick({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col items-center gap-1 cursor-pointer">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      <div
        className="w-full h-10 rounded-md border border-border relative overflow-hidden"
        style={{ backgroundColor: value }}
      >
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
        />
      </div>
    </label>
  );
}
