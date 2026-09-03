import { useCallback, useEffect, useRef, useState } from "react";
import { zipSync, type Zippable } from "fflate";

type Item = { file: File; id: string };

const IMG_RE = /\.(jpe?g|png|webp|bmp)$/i;

export function FileZipper() {
  const [items, setItems] = useState<Item[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [zipName, setZipName] = useState("archivum");

  const [useTarget, setUseTarget] = useState(false);
  const [targetMb, setTargetMb] = useState(10);
  const [shrinkImages, setShrinkImages] = useState(true);

  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultSize, setResultSize] = useState(0);
  const [hitTarget, setHitTarget] = useState<boolean | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const origSize = items.reduce((s, i) => s + i.file.size, 0);
  const hasImages = items.some((i) => IMG_RE.test(i.file.name));

  useEffect(() => () => { if (resultUrl) URL.revokeObjectURL(resultUrl); }, [resultUrl]);

  const addFiles = useCallback((list: FileList | null) => {
    if (!list?.length) return;
    const next = Array.from(list).map((file) => ({
      file,
      id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 7)}`,
    }));
    setItems((prev) => [...prev, ...next]);
    setResultUrl(null);
    setHitTarget(null);
  }, []);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    addFiles(e.dataTransfer.files);
  };

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
    setResultUrl(null);
    setHitTarget(null);
  };

  /** Re-encode an image file to JPEG at the given quality/scale. Returns null on failure. */
  const recompressImage = (file: File, quality: number, scale: number): Promise<Uint8Array | null> =>
    new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext("2d");
        if (!ctx) { URL.revokeObjectURL(url); resolve(null); return; }
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(async (b) => {
          URL.revokeObjectURL(url);
          if (!b) { resolve(null); return; }
          resolve(new Uint8Array(await b.arrayBuffer()));
        }, "image/jpeg", quality);
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
      img.src = url;
    });

  const uniqueName = (used: Set<string>, name: string) => {
    let n = name.replace(/^\/+/, "") || "file";
    if (!used.has(n)) { used.add(n); return n; }
    const dot = n.lastIndexOf(".");
    const base = dot > 0 ? n.slice(0, dot) : n;
    const ext = dot > 0 ? n.slice(dot) : "";
    let i = 2;
    while (used.has(`${base} (${i})${ext}`)) i++;
    const out = `${base} (${i})${ext}`;
    used.add(out);
    return out;
  };

  /** Build the fflate payload. imgOpts != null → images get re-encoded as JPEG. */
  const buildPayload = async (imgOpts: { quality: number; scale: number } | null) => {
    const used = new Set<string>();
    const payload: Zippable = {};
    for (const { file } of items) {
      let data: Uint8Array | null = null;
      let name = file.name;
      if (imgOpts && IMG_RE.test(file.name)) {
        data = await recompressImage(file, imgOpts.quality, imgOpts.scale);
        if (data) name = file.name.replace(/\.[^.]+$/, ".jpg");
      }
      if (!data) data = new Uint8Array(await file.arrayBuffer());
      // Already-compressed payloads gain nothing from deflate → store them.
      const store = /\.(zip|rar|7z|gz|bz2|xz|jpe?g|png|webp|mp3|mp4|mov|mkv|avi|ogg|webm|pdf)$/i.test(name);
      payload[uniqueName(used, name)] = [data, { level: store ? 0 : 9, mem: 12 }];
    }
    return payload;
  };

  const zipOnce = async (imgOpts: { quality: number; scale: number } | null) => {
    const payload = await buildPayload(imgOpts);
    return zipSync(payload, { level: 9, mem: 12 });
  };

  const handleZip = async () => {
    if (!items.length) return;
    setBusy(true);
    setResultUrl(null);
    setHitTarget(null);
    try {
      const targetBytes = targetMb * 1024 * 1024;
      setStatus("Compressing (maximum level)…");
      // Yield so the spinner paints before the synchronous deflate work.
      await new Promise((r) => setTimeout(r, 30));
      let out = await zipOnce(null);

      if (useTarget && out.byteLength > targetBytes && shrinkImages && hasImages) {
        const passes: Array<{ quality: number; scale: number }> = [
          { quality: 0.85, scale: 1 },
          { quality: 0.7, scale: 1 },
          { quality: 0.6, scale: 0.8 },
          { quality: 0.5, scale: 0.65 },
          { quality: 0.4, scale: 0.5 },
          { quality: 0.35, scale: 0.35 },
        ];
        for (let i = 0; i < passes.length; i++) {
          setStatus(`Recompressing images – attempt ${i + 1}/${passes.length}…`);
          await new Promise((r) => setTimeout(r, 20));
          const candidate = await zipOnce(passes[i]);
          out = candidate;
          if (candidate.byteLength <= targetBytes) break;
        }
      }

      const blob = new Blob([out.slice().buffer as ArrayBuffer], { type: "application/zip" });
      setResultUrl(URL.createObjectURL(blob));
      setResultSize(blob.size);
      setHitTarget(useTarget ? blob.size <= targetBytes : null);
      setStatus("");
    } catch (err) {
      setStatus(`Hiba: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const download = () => {
    if (!resultUrl) return;
    const a = document.createElement("a");
    a.href = resultUrl;
    a.download = `${zipName || "archivum"}.zip`;
    a.click();
  };

  return (
    <div className="grid lg:grid-cols-[360px_1fr] gap-6">
      <div className="space-y-5 bg-card/60 backdrop-blur border border-border rounded-2xl p-5">
        <label
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={`flex flex-col items-center justify-center gap-2 h-40 w-full rounded-xl border-2 border-dashed cursor-pointer transition ${
            dragOver ? "border-primary bg-primary/10" : "border-border bg-background/40 hover:border-primary/60"
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            multiple
            onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }}
            className="hidden"
          />
          <div className="text-4xl">🗂️</div>
          <p className="text-sm font-medium text-foreground">Drop your files here</p>
          <p className="text-xs text-muted-foreground">or click to browse (multiple files supported)</p>
        </label>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5 text-muted-foreground">
            ZIP file name
          </label>
          <div className="relative">
            <input
              value={zipName}
              onChange={(e) => setZipName(e.target.value)}
              className="w-full rounded-md border border-input bg-background/60 px-3 py-2 pr-12 text-sm"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">.zip</span>
          </div>
        </div>

        <div className="space-y-2 rounded-xl border border-border bg-background/40 p-3">
          <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer">
            <input type="checkbox" checked={useTarget} onChange={(e) => setUseTarget(e.target.checked)} />
            Set a target size
          </label>
          {useTarget && (
            <>
              <div className="flex items-center gap-2">
                <input
                  type="number" min={0.1} step={0.1}
                  value={targetMb}
                  onChange={(e) => setTargetMb(Math.max(0.1, Number(e.target.value) || 0.1))}
                  className="w-full rounded-md border border-input bg-background/60 px-3 py-2 text-sm"
                />
                <span className="text-sm font-mono text-muted-foreground">MB</span>
              </div>
              <label className="flex items-start gap-2 text-xs text-muted-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={shrinkImages}
                  onChange={(e) => setShrinkImages(e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  If it does not fit, images are recompressed lossily (JPEG) — that is the only way to truly hit the
                  target size.
                </span>
              </label>
              <p className="text-[11px] text-amber-400/80">
                Documents, videos and already-compressed files cannot be guaranteed to shrink
                losslessly.
              </p>
            </>
          )}
        </div>

        <button
          onClick={handleZip}
          disabled={!items.length || busy}
          className="w-full py-3 rounded-xl font-bold text-primary-foreground bg-gradient-to-r from-[oklch(0.72_0.28_340)] via-[oklch(0.65_0.27_295)] to-[oklch(0.82_0.18_200)] hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg"
        >
          {busy ? "Compressing…" : "Create ZIP"}
        </button>
        {status && <p className="text-xs text-muted-foreground text-center">{status}</p>}
      </div>

      <div className="bg-card/40 backdrop-blur border border-border rounded-2xl p-5 flex flex-col min-h-[400px] gap-4">
        {items.length === 0 ? (
          <p className="text-muted-foreground text-sm text-center m-auto">
            Upload files to get started.
          </p>
        ) : (
          <>
            <div className="flex items-baseline justify-between">
              <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                {items.length} files
              </h3>
              <div className="flex items-center gap-3">
                <span className="text-xs font-mono text-muted-foreground">{fmtSize(origSize)}</span>
                <button
                  onClick={() => { setItems([]); setResultUrl(null); setHitTarget(null); }}
                  className="text-xs text-muted-foreground hover:text-foreground underline"
                >
                  Clear all
                </button>
              </div>
            </div>

            <ul className="space-y-1.5 max-h-[45vh] overflow-y-auto pr-1">
              {items.map((it) => (
                <li
                  key={it.id}
                  className="flex items-center gap-3 rounded-lg border border-border bg-background/40 px-3 py-2"
                >
                  <span className="text-sm truncate flex-1" title={it.file.name}>{it.file.name}</span>
                  <span className="text-xs font-mono text-muted-foreground shrink-0">{fmtSize(it.file.size)}</span>
                  <button
                    onClick={() => removeItem(it.id)}
                    aria-label={`${it.file.name} remove`}
                    className="text-muted-foreground hover:text-destructive shrink-0"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>

            {resultUrl && (
              <div className="mt-auto pt-4 border-t border-border space-y-3">
                <div className="text-sm text-muted-foreground">
                  ZIP size: <span className="font-mono text-foreground">{fmtSize(resultSize)}</span>
                  {origSize > 0 && (
                    <> &nbsp;·&nbsp; {resultSize < origSize
                      ? `-${Math.round((1 - resultSize / origSize) * 100)}%`
                      : "no reduction (content is already compressed)"}</>
                  )}
                </div>
                {hitTarget === false && (
                  <p className="text-xs text-amber-400">
                    The target size ({targetMb} MB) cannot be reached losslessly with these files. Remove some
                    files, or use file splitting instead.
                  </p>
                )}
                {hitTarget === true && (
                  <p className="text-xs text-emerald-400">Within the {targetMb} MB target.</p>
                )}
                <button
                  onClick={download}
                  className="px-6 py-3 rounded-xl font-bold text-primary-foreground bg-gradient-to-r from-[oklch(0.72_0.28_340)] via-[oklch(0.65_0.27_295)] to-[oklch(0.82_0.18_200)] hover:opacity-90 shadow-lg"
                >
                  Download ZIP
                </button>
              </div>
            )}
          </>
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
