import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Progress } from "@/components/ui/progress";
import { Scissors, Trash2, Volume2, VolumeX, ArrowLeft, ArrowRight, Play, Pause, Plus } from "lucide-react";

type Segment = {
  id: string;
  srcStart: number; // seconds in original media
  srcEnd: number;
  muted: boolean;
};

// --- Tiny radix-2 FFT (in-place, complex), used for spectral features ---
function fft(re: Float32Array, im: Float32Array) {
  const n = re.length;
  // bit-reversal
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wlr = Math.cos(ang), wli = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let wr = 1, wi = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k], ui = im[i + k];
        const vr = re[i + k + len / 2] * wr - im[i + k + len / 2] * wi;
        const vi = re[i + k + len / 2] * wi + im[i + k + len / 2] * wr;
        re[i + k] = ur + vr; im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
        const nwr = wr * wlr - wi * wli;
        wi = wr * wli + wi * wlr;
        wr = nwr;
      }
    }
  }
}

const FEAT_DIM = 8; // 6 log-mel-ish bands + ZCR + centroid

function extractFeatures(channel: Float32Array, sampleRate: number) {
  const winSize = 1024;
  const hop = 512;
  const nFrames = Math.max(0, Math.floor((channel.length - winSize) / hop));
  const feats = new Float32Array(nFrames * FEAT_DIM);
  // Hann window
  const win = new Float32Array(winSize);
  for (let i = 0; i < winSize; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (winSize - 1));
  // 6 log-spaced bands across spectrum
  const nBins = winSize / 2;
  const bandEdges = [0, 4, 12, 30, 70, 160, nBins];
  const re = new Float32Array(winSize);
  const im = new Float32Array(winSize);
  for (let f = 0; f < nFrames; f++) {
    const off = f * hop;
    let zc = 0, prev = 0;
    for (let i = 0; i < winSize; i++) {
      const x = channel[off + i];
      re[i] = x * win[i];
      im[i] = 0;
      if (i > 0 && ((x >= 0) !== (prev >= 0))) zc++;
      prev = x;
    }
    fft(re, im);
    let totalE = 0, centroidNum = 0;
    const bandE = new Float32Array(6);
    for (let b = 0; b < 6; b++) {
      let e = 0;
      for (let k = bandEdges[b]; k < bandEdges[b + 1]; k++) {
        const mag = re[k] * re[k] + im[k] * im[k];
        e += mag;
        centroidNum += mag * k;
        totalE += mag;
      }
      bandE[b] = Math.log(1 + e);
    }
    const fo = f * FEAT_DIM;
    for (let b = 0; b < 6; b++) feats[fo + b] = bandE[b];
    feats[fo + 6] = zc / winSize;
    feats[fo + 7] = totalE > 0 ? centroidNum / totalE / nBins : 0;
  }
  // per-dim z-score normalize
  for (let d = 0; d < FEAT_DIM; d++) {
    let m = 0;
    for (let f = 0; f < nFrames; f++) m += feats[f * FEAT_DIM + d];
    m /= Math.max(1, nFrames);
    let s = 0;
    for (let f = 0; f < nFrames; f++) {
      const v = feats[f * FEAT_DIM + d] - m;
      s += v * v;
    }
    const sd = Math.sqrt(s / Math.max(1, nFrames)) || 1e-9;
    for (let f = 0; f < nFrames; f++) feats[f * FEAT_DIM + d] = (feats[f * FEAT_DIM + d] - m) / sd;
  }
  return { feats, nFrames, hop, sampleRate, dim: FEAT_DIM };
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export function VideoEditor() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const ffmpegRef = useRef<any>(null);
  const featuresRef = useRef<ReturnType<typeof extractFeatures> | null>(null);
  const audioBufferRef = useRef<AudioBuffer | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [srcDuration, setSrcDuration] = useState(0);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [playing, setPlaying] = useState(false);
  const [activeSegIdx, setActiveSegIdx] = useState(0);
  const [srcTime, setSrcTime] = useState(0);

  const [sensitivity, setSensitivity] = useState(0.82);
  const [analyzing, setAnalyzing] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [outUrl, setOutUrl] = useState("");

  const totalDuration = useMemo(
    () => segments.reduce((a, s) => a + (s.srcEnd - s.srcStart), 0),
    [segments],
  );

  // Virtual time (timeline position) computed from active seg + srcTime
  const virtualTime = useMemo(() => {
    let t = 0;
    for (let i = 0; i < activeSegIdx && i < segments.length; i++) {
      t += segments[i].srcEnd - segments[i].srcStart;
    }
    const seg = segments[activeSegIdx];
    if (seg) t += Math.max(0, srcTime - seg.srcStart);
    return t;
  }, [activeSegIdx, srcTime, segments]);

  const onPick = async (f: File) => {
    setFile(f);
    setOutUrl("");
    setSegments([]);
    setSelectedId(null);
    setActiveSegIdx(0);
    audioBufferRef.current = null;
    featuresRef.current = null;
    setUrl(URL.createObjectURL(f));
  };

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onMeta = () => {
      const d = v.duration || 0;
      setSrcDuration(d);
      const seg: Segment = { id: uid(), srcStart: 0, srcEnd: d, muted: false };
      setSegments([seg]);
      setSelectedId(seg.id);
      setActiveSegIdx(0);
    };
    v.addEventListener("loadedmetadata", onMeta);
    return () => v.removeEventListener("loadedmetadata", onMeta);
  }, [url]);

  // Playback engine: rAF watches srcTime, jumps between segments, applies mute live
  useEffect(() => {
    const v = videoRef.current;
    if (!v || segments.length === 0) return;
    let raf = 0;
    const tick = () => {
      const t = v.currentTime;
      setSrcTime(t);
      const cur = segments[activeSegIdx];
      if (cur) {
        // apply mute live
        if (v.muted !== cur.muted) v.muted = cur.muted;
        // crossed end of current segment?
        if (t >= cur.srcEnd - 0.02) {
          const next = activeSegIdx + 1;
          if (next < segments.length) {
            setActiveSegIdx(next);
            v.currentTime = segments[next].srcStart;
          } else {
            v.pause();
          }
        } else if (t < cur.srcStart - 0.02) {
          v.currentTime = cur.srcStart;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    return () => {
      cancelAnimationFrame(raf);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
    };
  }, [segments, activeSegIdx]);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      const cur = segments[activeSegIdx];
      if (cur && (v.currentTime < cur.srcStart || v.currentTime >= cur.srcEnd - 0.05)) {
        v.currentTime = cur.srcStart;
      }
      v.play();
    } else v.pause();
  };

  // Seek by virtual timeline position
  const seekVirtual = (vt: number) => {
    const v = videoRef.current;
    if (!v) return;
    let acc = 0;
    for (let i = 0; i < segments.length; i++) {
      const dur = segments[i].srcEnd - segments[i].srcStart;
      if (vt <= acc + dur) {
        setActiveSegIdx(i);
        v.currentTime = segments[i].srcStart + (vt - acc);
        return;
      }
      acc += dur;
    }
    // past end
    const last = segments.length - 1;
    if (last >= 0) {
      setActiveSegIdx(last);
      v.currentTime = segments[last].srcEnd;
    }
  };

  const splitAtPlayhead = () => {
    const cur = segments[activeSegIdx];
    if (!cur) return;
    const t = srcTime;
    if (t <= cur.srcStart + 0.05 || t >= cur.srcEnd - 0.05) return;
    const a: Segment = { id: uid(), srcStart: cur.srcStart, srcEnd: t, muted: cur.muted };
    const b: Segment = { id: uid(), srcStart: t, srcEnd: cur.srcEnd, muted: cur.muted };
    const next = [...segments];
    next.splice(activeSegIdx, 1, a, b);
    setSegments(next);
    setSelectedId(b.id);
  };

  const removeSegment = (id: string) => {
    const idx = segments.findIndex((s) => s.id === id);
    if (idx < 0) return;
    const next = segments.filter((s) => s.id !== id);
    setSegments(next);
    if (next.length === 0) return;
    const newIdx = Math.min(idx, next.length - 1);
    setActiveSegIdx(newIdx);
    setSelectedId(next[newIdx].id);
    const v = videoRef.current;
    if (v) v.currentTime = next[newIdx].srcStart;
  };

  const toggleMute = (id: string) => {
    setSegments((s) => s.map((x) => (x.id === id ? { ...x, muted: !x.muted } : x)));
  };

  const moveSeg = (id: string, dir: -1 | 1) => {
    const idx = segments.findIndex((s) => s.id === id);
    const j = idx + dir;
    if (idx < 0 || j < 0 || j >= segments.length) return;
    const next = [...segments];
    [next[idx], next[j]] = [next[j], next[idx]];
    setSegments(next);
    setActiveSegIdx(j);
  };

  const jumpToSeg = (id: string) => {
    const idx = segments.findIndex((s) => s.id === id);
    if (idx < 0) return;
    setActiveSegIdx(idx);
    setSelectedId(id);
    const v = videoRef.current;
    if (v) v.currentTime = segments[idx].srcStart;
  };

  // ---- Smart mute (improved) ----
  const ensureFeatures = useCallback(async () => {
    if (featuresRef.current || !file) return featuresRef.current;
    setStatus("Hangsáv elemzése…");
    const ab = await file.arrayBuffer();
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const buf = await ctx.decodeAudioData(ab.slice(0));
    audioBufferRef.current = buf;
    // mix down to mono
    const len = buf.length;
    const mono = new Float32Array(len);
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const ch = buf.getChannelData(c);
      for (let i = 0; i < len; i++) mono[i] += ch[i];
    }
    for (let i = 0; i < len; i++) mono[i] /= buf.numberOfChannels;
    featuresRef.current = extractFeatures(mono, buf.sampleRate);
    setStatus("");
    return featuresRef.current;
  }, [file]);

  const smartMuteFromSegment = async (id: string) => {
    const seg = segments.find((s) => s.id === id);
    if (!seg) return;
    setAnalyzing(true);
    try {
      const F = await ensureFeatures();
      if (!F) return;
      const { feats, nFrames, hop, sampleRate, dim } = F;
      const frameDur = hop / sampleRate;
      const startFrame = Math.max(0, Math.floor(seg.srcStart / frameDur));
      const endFrame = Math.min(nFrames, Math.ceil(seg.srcEnd / frameDur));
      const L = endFrame - startFrame;
      if (L < 4) {
        setStatus("Túl rövid minta a kereséshez.");
        setTimeout(() => setStatus(""), 2000);
        return;
      }
      // cosine similarity of average feature vector + frame-by-frame
      const step = Math.max(1, Math.floor(L / 4));
      const tmpl = feats.subarray(startFrame * dim, endFrame * dim);
      // precompute template norm per frame
      const tnorm = new Float32Array(L);
      for (let i = 0; i < L; i++) {
        let s = 0;
        for (let d = 0; d < dim; d++) {
          const v = tmpl[i * dim + d];
          s += v * v;
        }
        tnorm[i] = Math.sqrt(s) || 1e-9;
      }
      const scores: { frame: number; score: number }[] = [];
      for (let i = 0; i + L <= nFrames; i += step) {
        let sumCos = 0;
        for (let k = 0; k < L; k++) {
          let dot = 0, wn = 0;
          const wo = (i + k) * dim;
          const to = k * dim;
          for (let d = 0; d < dim; d++) {
            const w = feats[wo + d];
            dot += w * tmpl[to + d];
            wn += w * w;
          }
          sumCos += dot / ((Math.sqrt(wn) || 1e-9) * tnorm[k]);
        }
        scores.push({ frame: i, score: sumCos / L });
      }
      const thresh = sensitivity;
      // non-max suppression
      scores.sort((a, b) => b.score - a.score);
      const picked: { start: number; end: number }[] = [];
      for (const s of scores) {
        if (s.score < thresh) break;
        const st = s.frame * frameDur;
        const en = (s.frame + L) * frameDur;
        if (picked.some((p) => !(en < p.start || st > p.end))) continue;
        picked.push({ start: st, end: en });
      }
      if (picked.length === 0) {
        setStatus(`Nem találtam hasonlót (érzékenység ${sensitivity.toFixed(2)}).`);
        setTimeout(() => setStatus(""), 2500);
        return;
      }
      // Split existing segments at every picked boundary and mute matching ranges
      let next = [...segments];
      const cuts = new Set<number>();
      picked.forEach((p) => {
        cuts.add(+p.start.toFixed(3));
        cuts.add(+p.end.toFixed(3));
      });
      // apply cuts
      for (const cut of [...cuts].sort((a, b) => a - b)) {
        next = next.flatMap((s) => {
          if (cut > s.srcStart + 0.02 && cut < s.srcEnd - 0.02) {
            return [
              { ...s, srcEnd: cut },
              { id: uid(), srcStart: cut, srcEnd: s.srcEnd, muted: s.muted },
            ];
          }
          return [s];
        });
      }
      // mute segments fully inside any picked range
      next = next.map((s) => {
        const mid = (s.srcStart + s.srcEnd) / 2;
        const hit = picked.some((p) => mid >= p.start && mid <= p.end);
        return hit ? { ...s, muted: true } : s;
      });
      setSegments(next);
      setStatus(`${picked.length} hasonló szakasz megtalálva és lenémítva.`);
      setTimeout(() => setStatus(""), 2500);
    } finally {
      setAnalyzing(false);
    }
  };

  // ---- FFmpeg render: concat segments with mutes ----
  const loadFfmpeg = async () => {
    if (ffmpegRef.current) return ffmpegRef.current;
    setStatus("FFmpeg betöltése…");
    const { FFmpeg } = await import("@ffmpeg/ffmpeg");
    const { toBlobURL } = await import("@ffmpeg/util");
    const ff = new FFmpeg();
    ff.on("progress", ({ progress: p }: any) => setProgress(Math.round((p || 0) * 100)));
    const bases = [
      "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd",
      "https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd",
    ];
    let loaded = false;
    let lastErr: any = null;
    for (const base of bases) {
      try {
        const coreURL = await toBlobURL(`${base}/ffmpeg-core.js`, "text/javascript");
        const wasmURL = await toBlobURL(`${base}/ffmpeg-core.wasm`, "application/wasm");
        await ff.load({ coreURL, wasmURL });
        loaded = true;
        break;
      } catch (e) {
        lastErr = e;
        console.warn("FFmpeg load failed from", base, e);
      }
    }
    if (!loaded) throw new Error("FFmpeg betöltési hiba: " + (lastErr?.message || lastErr));
    ffmpegRef.current = ff;
    setStatus("");
    return ff;
  };

  const render = async () => {
    if (!file || segments.length === 0) return;
    setRendering(true);
    setOutUrl("");
    setProgress(0);
    try {
      const ff = await loadFfmpeg();
      const { fetchFile } = await import("@ffmpeg/util");
      setStatus("Feltöltés FFmpeg-be…");
      await ff.writeFile("in.mp4", await fetchFile(file));

      // Build filter_complex
      const parts: string[] = [];
      segments.forEach((s, i) => {
        parts.push(
          `[0:v]trim=start=${s.srcStart.toFixed(3)}:end=${s.srcEnd.toFixed(3)},setpts=PTS-STARTPTS[v${i}]`,
        );
        const vol = s.muted ? 0 : 1;
        parts.push(
          `[0:a]atrim=start=${s.srcStart.toFixed(3)}:end=${s.srcEnd.toFixed(3)},asetpts=PTS-STARTPTS,volume=${vol}[a${i}]`,
        );
      });
      const concatIn = segments.map((_, i) => `[v${i}][a${i}]`).join("");
      parts.push(`${concatIn}concat=n=${segments.length}:v=1:a=1[outv][outa]`);
      const filter = parts.join(";");

      const args = [
        "-i",
        "in.mp4",
        "-filter_complex",
        filter,
        "-map",
        "[outv]",
        "-map",
        "[outa]",
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
      ];

      setStatus("Renderelés…");
      await ff.exec(args);
      const data = (await ff.readFile("out.mp4")) as Uint8Array;
      const blob = new Blob([data.buffer as ArrayBuffer], { type: "video/mp4" });
      setOutUrl(URL.createObjectURL(blob));
      setStatus("Kész!");
    } catch (e: any) {
      console.error(e);
      setStatus("Hiba: " + (e?.message || e));
    } finally {
      setRendering(false);
    }
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

  const pct = (t: number) => (totalDuration > 0 ? `${(t / totalDuration) * 100}%` : "0%");

  return (
    <div className="space-y-4">
      {/* Preview */}
      <div className="rounded-xl overflow-hidden bg-black">
        <video ref={videoRef} src={url} className="w-full max-h-[55vh]" />
      </div>

      {/* Transport */}
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={togglePlay} variant="secondary" size="sm">
          {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
        </Button>
        <Button onClick={splitAtPlayhead} variant="default" size="sm" title="Vágás a lejátszófejnél (S)">
          <Scissors className="w-4 h-4 mr-1" /> Vágás
        </Button>
        <span className="text-sm text-muted-foreground tabular-nums">
          {virtualTime.toFixed(2)}s / {totalDuration.toFixed(2)}s
        </span>
        <div className="flex-1" />
        <span className="text-xs text-muted-foreground">
          Eredeti: {srcDuration.toFixed(2)}s
        </span>
      </div>

      {/* Virtual timeline scrubber */}
      <div className="relative h-3 rounded-full bg-card border border-border overflow-hidden">
        <div className="absolute top-0 bottom-0 bg-primary/80" style={{ width: pct(virtualTime) }} />
        <input
          type="range"
          min={0}
          max={totalDuration || 1}
          step={0.01}
          value={Math.min(virtualTime, totalDuration)}
          onChange={(e) => seekVirtual(parseFloat(e.target.value))}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />
      </div>

      {/* CapCut-style segment track */}
      <div className="rounded-xl border border-border p-2 bg-card/40">
        <div className="text-xs text-muted-foreground mb-2 px-1">Idővonal — kattints egy klipre a kiválasztáshoz</div>
        <div className="flex gap-1 overflow-x-auto pb-2 min-h-[72px]">
          {segments.map((s, i) => {
            const dur = s.srcEnd - s.srcStart;
            const w = Math.max(60, (dur / Math.max(1, totalDuration)) * 700);
            const sel = s.id === selectedId;
            const active = i === activeSegIdx;
            return (
              <div
                key={s.id}
                onClick={() => {
                  setSelectedId(s.id);
                  jumpToSeg(s.id);
                }}
                className={`shrink-0 rounded-lg border-2 cursor-pointer transition relative overflow-hidden ${
                  sel ? "border-primary" : "border-border"
                } ${s.muted ? "bg-red-500/15" : "bg-primary/10"} ${active ? "ring-2 ring-primary/50" : ""}`}
                style={{ width: `${w}px`, height: "64px" }}
              >
                <div className="absolute inset-x-0 top-0 px-2 py-1 text-[10px] flex items-center justify-between bg-background/60">
                  <span className="tabular-nums">#{i + 1}</span>
                  {s.muted && <VolumeX className="w-3 h-3 text-red-400" />}
                </div>
                <div className="absolute inset-x-0 bottom-0 px-2 py-1 text-[10px] tabular-nums bg-background/60">
                  {dur.toFixed(2)}s
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Selected segment controls */}
      {selectedId && (() => {
        const s = segments.find((x) => x.id === selectedId);
        if (!s) return null;
        return (
          <div className="rounded-lg border border-border p-3 flex flex-wrap items-center gap-2">
            <div className="text-sm font-semibold mr-2">
              Klip #{segments.findIndex((x) => x.id === selectedId) + 1}
              <span className="text-muted-foreground ml-2 tabular-nums text-xs">
                {s.srcStart.toFixed(2)}s → {s.srcEnd.toFixed(2)}s
              </span>
            </div>
            <Button size="sm" variant={s.muted ? "default" : "outline"} onClick={() => toggleMute(s.id)}>
              {s.muted ? <VolumeX className="w-4 h-4 mr-1" /> : <Volume2 className="w-4 h-4 mr-1" />}
              {s.muted ? "Némítva" : "Némítás"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => moveSeg(s.id, -1)} title="Balra mozgatás">
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <Button size="sm" variant="outline" onClick={() => moveSeg(s.id, 1)} title="Jobbra mozgatás">
              <ArrowRight className="w-4 h-4" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={analyzing}
              onClick={() => smartMuteFromSegment(s.id)}
              title="Hasonló hangok keresése és némítása a teljes videóban"
            >
              <Plus className="w-4 h-4 mr-1" /> {analyzing ? "Elemzés…" : "AI: hasonlók némítása"}
            </Button>
            <div className="flex-1" />
            <Button size="sm" variant="destructive" onClick={() => removeSegment(s.id)}>
              <Trash2 className="w-4 h-4 mr-1" /> Törlés
            </Button>
          </div>
        );
      })()}

      {/* Sensitivity */}
      <div className="rounded-lg border border-border p-3">
        <div className="flex items-center justify-between text-sm mb-1">
          <span>AI érzékenység (cosine küszöb)</span>
          <span className="text-muted-foreground tabular-nums">{sensitivity.toFixed(2)}</span>
        </div>
        <Slider
          min={0.6}
          max={0.98}
          step={0.01}
          value={[sensitivity]}
          onValueChange={(v) => setSensitivity(v[0])}
        />
        <p className="text-xs text-muted-foreground mt-1">
          Multi-band spektrális elemzés (FFT + 6 sáv + ZCR + spektrális centroid). Magasabb érték = szigorúbb találat.
        </p>
      </div>

      {/* Render */}
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={render} disabled={rendering || analyzing || segments.length === 0}>
          {rendering ? "Renderelés…" : "🎬 MP4 exportálása"}
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            setFile(null);
            setUrl("");
            setOutUrl("");
            setSegments([]);
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
