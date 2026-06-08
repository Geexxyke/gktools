import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Progress } from "@/components/ui/progress";

type Range = { start: number; end: number; smart?: boolean };

export function VideoEditor() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const ffmpegRef = useRef<any>(null);
  const audioBufferRef = useRef<AudioBuffer | null>(null);
  const rmsRef = useRef<{ env: Float32Array; hop: number } | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState<string>("");
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);
  const [playing, setPlaying] = useState(false);

  const [trim, setTrim] = useState<[number, number]>([0, 0]);
  const [mutes, setMutes] = useState<Range[]>([]);
  const [markIn, setMarkIn] = useState<number | null>(null);

  const [sensitivity, setSensitivity] = useState(0.78);
  const [analyzing, setAnalyzing] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [outUrl, setOutUrl] = useState("");

  // Load file
  const onPick = async (f: File) => {
    setFile(f);
    setOutUrl("");
    setMutes([]);
    setMarkIn(null);
    const u = URL.createObjectURL(f);
    setUrl(u);
    // decode audio for analysis (lazy)
    audioBufferRef.current = null;
    rmsRef.current = null;
  };

  // Init video metadata
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onMeta = () => {
      setDuration(v.duration || 0);
      setTrim([0, v.duration || 0]);
    };
    const onTime = () => setCurrent(v.currentTime);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    v.addEventListener("loadedmetadata", onMeta);
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    return () => {
      v.removeEventListener("loadedmetadata", onMeta);
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
    };
  }, [url]);

  const ensureAudio = useCallback(async () => {
    if (audioBufferRef.current || !file) return audioBufferRef.current;
    setStatus("Hangsáv dekódolása…");
    const ab = await file.arrayBuffer();
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const buf = await ctx.decodeAudioData(ab.slice(0));
    audioBufferRef.current = buf;
    // build RMS envelope (mono)
    const hop = Math.floor(buf.sampleRate * 0.02); // 20ms
    const ch0 = buf.getChannelData(0);
    const n = Math.floor(ch0.length / hop);
    const env = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let s = 0;
      const o = i * hop;
      for (let j = 0; j < hop; j++) {
        const x = ch0[o + j];
        s += x * x;
      }
      env[i] = Math.sqrt(s / hop);
    }
    rmsRef.current = { env, hop };
    setStatus("");
    return buf;
  }, [file]);

  const addMute = () => {
    if (markIn === null) {
      setMarkIn(current);
    } else {
      const a = Math.min(markIn, current);
      const b = Math.max(markIn, current);
      if (b - a > 0.05) setMutes((m) => [...m, { start: a, end: b }]);
      setMarkIn(null);
    }
  };

  const removeMute = (i: number) => setMutes((m) => m.filter((_, k) => k !== i));

  // Smart mute: find similar segments to selected range
  const smartMute = async (idx: number) => {
    const ref = mutes[idx];
    if (!ref) return;
    setAnalyzing(true);
    try {
      const buf = await ensureAudio();
      if (!buf || !rmsRef.current) return;
      const { env, hop } = rmsRef.current;
      const sr = buf.sampleRate;
      const startFrame = Math.floor((ref.start * sr) / hop);
      const endFrame = Math.floor((ref.end * sr) / hop);
      const tmpl = env.slice(startFrame, endFrame);
      if (tmpl.length < 3) return;

      // normalize template
      const norm = (a: Float32Array) => {
        let mean = 0;
        for (const v of a) mean += v;
        mean /= a.length;
        let s2 = 0;
        for (const v of a) s2 += (v - mean) ** 2;
        const sd = Math.sqrt(s2 / a.length) || 1e-9;
        const out = new Float32Array(a.length);
        for (let i = 0; i < a.length; i++) out[i] = (a[i] - mean) / sd;
        return out;
      };
      const T = norm(tmpl);
      const L = T.length;

      // sliding normalized cross-correlation (step every ~40ms)
      const step = Math.max(1, Math.floor(L / 8));
      const scores: { i: number; score: number }[] = [];
      const window = new Float32Array(L);
      for (let i = 0; i + L < env.length; i += step) {
        for (let k = 0; k < L; k++) window[k] = env[i + k];
        const W = norm(window);
        let dot = 0;
        for (let k = 0; k < L; k++) dot += W[k] * T[k];
        scores.push({ i, score: dot / L });
      }

      const thresh = sensitivity * 1; // sensitivity is correlation threshold
      const matches: Range[] = [];
      for (const { i, score } of scores) {
        if (score < thresh) continue;
        const s = (i * hop) / sr;
        const e = ((i + L) * hop) / sr;
        // skip if overlaps existing mute
        const overlaps = (a: Range) => !(e < a.start || s > a.end);
        if (mutes.some(overlaps)) continue;
        if (matches.some(overlaps)) continue;
        matches.push({ start: s, end: e, smart: true });
      }
      if (matches.length === 0) {
        setStatus(`Nem találtam hasonló hangot (érzékenység ${sensitivity.toFixed(2)}).`);
        setTimeout(() => setStatus(""), 2500);
      } else {
        setMutes((m) => [...m, ...matches].sort((a, b) => a.start - b.start));
        setStatus(`${matches.length} hasonló szakasz hozzáadva.`);
        setTimeout(() => setStatus(""), 2500);
      }
    } finally {
      setAnalyzing(false);
    }
  };

  const loadFfmpeg = async () => {
    if (ffmpegRef.current) return ffmpegRef.current;
    setStatus("FFmpeg betöltése…");
    const { FFmpeg } = await import("@ffmpeg/ffmpeg");
    const { toBlobURL } = await import("@ffmpeg/util");
    const ff = new FFmpeg();
    ff.on("progress", ({ progress: p }: any) => setProgress(Math.round((p || 0) * 100)));
    const base = "https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd";
    await ff.load({
      coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, "application/wasm"),
    });
    ffmpegRef.current = ff;
    setStatus("");
    return ff;
  };

  const render = async () => {
    if (!file) return;
    setRendering(true);
    setOutUrl("");
    setProgress(0);
    try {
      const ff = await loadFfmpeg();
      const { fetchFile } = await import("@ffmpeg/util");
      setStatus("Feltöltés FFmpeg-be…");
      await ff.writeFile("in.mp4", await fetchFile(file));

      const [ts, te] = trim;
      // build volume filter from mutes (translated to trimmed timeline)
      const adjusted = mutes
        .map((m) => ({ start: Math.max(0, m.start - ts), end: Math.max(0, Math.min(te, m.end) - ts) }))
        .filter((m) => m.end > m.start);

      const args: string[] = ["-i", "in.mp4"];
      args.push("-ss", ts.toFixed(3));
      args.push("-to", te.toFixed(3));
      if (adjusted.length > 0) {
        const expr = adjusted.map((m) => `between(t,${m.start.toFixed(3)},${m.end.toFixed(3)})`).join("+");
        args.push("-af", `volume=enable='${expr}':volume=0`);
      }
      args.push(
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-crf",
        "23",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-movflags",
        "+faststart",
        "out.mp4",
      );

      setStatus("Renderelés…");
      await ff.exec(args);
      const data = (await ff.readFile("out.mp4")) as Uint8Array;
      const blob = new Blob([data.buffer as ArrayBuffer], { type: "video/mp4" });
      setOutUrl(URL.createObjectURL(blob));
      setStatus("Kész!");
    } catch (e: any) {
      console.error(e);
      setStatus("Hiba renderelés közben: " + (e?.message || e));
    } finally {
      setRendering(false);
    }
  };

  const seek = (t: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, Math.min(duration, t));
  };

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play();
    else v.pause();
  };

  if (!file) {
    return (
      <div className="border-2 border-dashed border-border rounded-2xl p-12 text-center">
        <p className="text-muted-foreground mb-4">Húzz be vagy válassz egy videót (MP4, WebM, MOV)…</p>
        <input
          type="file"
          accept="video/*"
          onChange={(e) => e.target.files?.[0] && onPick(e.target.files[0])}
          className="block mx-auto text-sm"
        />
        <p className="text-xs text-muted-foreground mt-4">
          A feldolgozás teljesen a böngésződben fut, semmi sem kerül szerverre.
        </p>
      </div>
    );
  }

  const pct = (t: number) => `${(t / duration) * 100}%`;

  return (
    <div className="space-y-4">
      <div className="rounded-xl overflow-hidden bg-black">
        <video ref={videoRef} src={url} className="w-full max-h-[60vh]" controls={false} />
      </div>

      {/* Timeline */}
      <div className="relative h-12 rounded-lg bg-card border border-border overflow-hidden">
        {/* trimmed area */}
        <div
          className="absolute top-0 bottom-0 bg-primary/10"
          style={{ left: pct(trim[0]), width: pct(trim[1] - trim[0]) }}
        />
        {/* mutes */}
        {mutes.map((m, i) => (
          <div
            key={i}
            className={`absolute top-1 bottom-1 ${m.smart ? "bg-fuchsia-500/70" : "bg-red-500/70"} rounded`}
            style={{ left: pct(m.start), width: pct(m.end - m.start) }}
            title={`${m.start.toFixed(2)}s – ${m.end.toFixed(2)}s`}
          />
        ))}
        {/* mark in */}
        {markIn !== null && (
          <div className="absolute top-0 bottom-0 w-0.5 bg-yellow-400" style={{ left: pct(markIn) }} />
        )}
        {/* playhead */}
        <div className="absolute top-0 bottom-0 w-0.5 bg-white" style={{ left: pct(current) }} />
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.01}
          value={current}
          onChange={(e) => seek(parseFloat(e.target.value))}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={togglePlay} variant="secondary">
          {playing ? "⏸" : "▶"}
        </Button>
        <span className="text-sm text-muted-foreground tabular-nums">
          {current.toFixed(2)}s / {duration.toFixed(2)}s
        </span>
        <div className="flex-1" />
        <Button onClick={addMute} variant={markIn !== null ? "default" : "outline"}>
          {markIn !== null ? `Némítás vége itt (${markIn.toFixed(2)}s →)` : "Némítás kezdete itt"}
        </Button>
      </div>

      {/* Trim */}
      <div className="rounded-lg border border-border p-4 space-y-2">
        <div className="flex justify-between text-sm font-semibold">
          <span>Vágás (megtartott rész)</span>
          <span className="text-muted-foreground tabular-nums">
            {trim[0].toFixed(2)}s – {trim[1].toFixed(2)}s
          </span>
        </div>
        <Slider
          min={0}
          max={duration || 1}
          step={0.01}
          value={trim}
          onValueChange={(v) => setTrim([v[0], v[1]] as [number, number])}
        />
      </div>

      {/* Mute list */}
      {mutes.length > 0 && (
        <div className="rounded-lg border border-border p-4 space-y-2">
          <div className="font-semibold text-sm mb-2">Némított szakaszok</div>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {mutes.map((m, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <span
                  className={`w-2 h-2 rounded-full ${m.smart ? "bg-fuchsia-500" : "bg-red-500"}`}
                />
                <span className="tabular-nums flex-1">
                  {m.start.toFixed(2)}s → {m.end.toFixed(2)}s
                  {m.smart && <span className="ml-2 text-xs text-fuchsia-400">smart</span>}
                </span>
                <Button size="sm" variant="ghost" onClick={() => seek(m.start)}>
                  Ugrás
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={analyzing}
                  onClick={() => smartMute(i)}
                  title="Hasonló hangok keresése a videóban"
                >
                  🔍 Hasonló némítása
                </Button>
                <Button size="sm" variant="ghost" onClick={() => removeMute(i)}>
                  ✕
                </Button>
              </div>
            ))}
          </div>
          <div className="pt-2 border-t border-border">
            <div className="flex items-center justify-between text-sm mb-1">
              <span>Smart érzékenység</span>
              <span className="text-muted-foreground tabular-nums">{sensitivity.toFixed(2)}</span>
            </div>
            <Slider
              min={0.5}
              max={0.95}
              step={0.01}
              value={[sensitivity]}
              onValueChange={(v) => setSensitivity(v[0])}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Magasabb érték = csak a nagyon hasonló hangokat némítja. Alacsonyabb = több találat.
            </p>
          </div>
        </div>
      )}

      {/* Render */}
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={render} disabled={rendering || analyzing}>
          {rendering ? "Renderelés…" : "🎬 MP4 exportálása"}
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            setFile(null);
            setUrl("");
            setOutUrl("");
            setMutes([]);
          }}
        >
          Új videó
        </Button>
        {status && <span className="text-sm text-muted-foreground">{status}</span>}
        {(rendering || progress > 0) && (
          <div className="flex-1 min-w-[200px]">
            <Progress value={progress} />
          </div>
        )}
      </div>

      {outUrl && (
        <div className="rounded-xl border border-border p-4 space-y-3">
          <div className="font-semibold">Eredmény</div>
          <video src={outUrl} controls className="w-full rounded-lg max-h-[50vh] bg-black" />
          <a
            href={outUrl}
            download="gktools-video.mp4"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-semibold"
          >
            ⬇ Letöltés (MP4)
          </a>
        </div>
      )}
    </div>
  );
}
