import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy, ExternalLink, ImageUp, Loader2, Upload } from "lucide-react";

type Uploaded = {
  name: string;
  url: string;
  size: number;
  preview: string;
};

const fmt = (b: number) => (b < 1024 * 1024 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1048576).toFixed(2)} MB`);

export function ImageHost() {
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<Uploaded[]>([]);
  const [copied, setCopied] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const urlsRef = useRef<string[]>([]);

  useEffect(() => () => urlsRef.current.forEach((u) => URL.revokeObjectURL(u)), []);

  const upload = useCallback(async (files: File[]) => {
    const images = files.filter((f) => f.type.startsWith("image/"));
    if (!images.length) {
      setError("Only image files can be hosted.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      for (const file of images) {
        const body = new FormData();
        body.append("file", file);
        const res = await fetch("/api/public/upload", { method: "POST", body });
        const json = (await res.json()) as { url?: string; error?: string };
        if (!res.ok || !json.url) throw new Error(json.error || "Upload failed.");
        const preview = URL.createObjectURL(file);
        urlsRef.current.push(preview);
        setItems((prev) => [{ name: file.name, url: json.url!, size: file.size, preview }, ...prev]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }, []);

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(url);
      setTimeout(() => setCopied(null), 1600);
    } catch {
      setError("Clipboard access was blocked by your browser.");
    }
  };

  return (
    <div className="space-y-5">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          void upload(Array.from(e.dataTransfer.files));
        }}
        onClick={() => inputRef.current?.click()}
        className={`cursor-pointer rounded-lg border border-dashed p-10 text-center transition ${
          dragOver ? "border-primary bg-card" : "border-border bg-card/40 hover:border-primary/50"
        }`}
      >
        <ImageUp className="size-6 text-primary mx-auto" />
        <p className="text-sm font-semibold mt-3">Drop images here, or click to choose</p>
        <p className="text-xs text-muted-foreground mt-1.5">
          PNG, JPG, GIF, WEBP, AVIF, BMP or SVG — up to 25 MB each. You get a permanent direct link
          that embeds in Discord, forums and bots.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            void upload(Array.from(e.target.files ?? []));
            e.currentTarget.value = "";
          }}
        />
      </div>

      {busy && (
        <p className="text-sm text-muted-foreground inline-flex items-center gap-2">
          <Loader2 className="size-4 animate-spin text-primary" /> Uploading…
        </p>
      )}

      {error && (
        <p className="text-sm text-destructive rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2">
          {error}
        </p>
      )}

      {items.length > 0 && (
        <div className="space-y-3">
          <p className="mono-label">Your links</p>
          {items.map((it) => (
            <article
              key={it.url}
              className="rounded-lg border border-border bg-card/50 p-4 flex flex-col sm:flex-row gap-4"
            >
              <img
                src={it.preview}
                alt={it.name}
                className="size-20 rounded-md object-cover border border-border shrink-0"
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold truncate">{it.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{fmt(it.size)}</p>
                <div className="flex items-center gap-2 mt-3">
                  <input
                    readOnly
                    value={it.url}
                    onFocus={(e) => e.currentTarget.select()}
                    className="flex-1 min-w-0 rounded-md border border-border bg-background/60 px-3 py-2 text-xs font-mono"
                  />
                  <button
                    onClick={() => void copy(it.url)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 transition shrink-0"
                  >
                    {copied === it.url ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                    {copied === it.url ? "Copied" : "Copy"}
                  </button>
                  <a
                    href={it.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-border text-xs font-semibold hover:bg-card transition shrink-0"
                  >
                    <ExternalLink className="size-3.5" /> Open
                  </a>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
        <Upload className="size-3.5" /> Files are stored on the GK Tools backend and served straight
        from the link — anyone with the link can view the image.
      </p>
    </div>
  );
}
