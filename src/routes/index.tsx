import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { MemeGenerator } from "@/components/MemeGenerator";
import { ImageCompressor } from "@/components/ImageCompressor";
import { FaceBlur } from "@/components/FaceBlur";
import { VideoEditor } from "@/components/VideoEditor";
import { FileZipper } from "@/components/FileZipper";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "GK Tools — Kreatív eszközök egy helyen" },
      { name: "description", content: "Mémgenerátor, képtömörítő és arc kitakaró — gyors, böngészőből futó kreatív online eszközök egy helyen." },
      { property: "og:url", content: "https://gktools.lovable.app/" },
    ],
    links: [
      { rel: "canonical", href: "https://gktools.lovable.app/" },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: "GK Tools",
          url: "https://gktools.lovable.app/",
          description: "Kreatív online eszközök gyűjteménye: mémgenerátor, képtömörítő, arc kitakaró.",
        }),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "GK Tools",
          url: "https://gktools.lovable.app/",
        }),
      },
    ],
  }),
  component: Home,
});


type Tab = "home" | "meme" | "image" | "blur" | "video";

const tools = [
  {
    id: "meme" as const,
    name: "Mémgenerátor",
    icon: "🎭",
    desc: "Tölts fel egy képet, adj hozzá fehér sávot és Impact szöveget.",
    ready: true,
  },
  {
    id: "image" as const,
    name: "Kép tömörítő & Resize",
    icon: "🗜️",
    desc: "Tömöríts pontos MB-ra vagy állíts be új px méretet.",
    ready: true,
  },
  {
    id: "blur" as const,
    name: "Arc kitakaró",
    icon: "🫥",
    desc: "Homályosítsd, pixelezd vagy takard ki az arcokat a képen.",
    ready: true,
  },
  {
    id: "video" as const,
    name: "Videó vágó + smart mute",
    icon: "🎬",
    desc: "Vágd, némítsd a videót — és AI-jal némíttasd az összes hasonló hangot.",
    ready: true,
  },
];

function Home() {
  const [tab, setTab] = useState<Tab>("home");

  return (
    <div className="min-h-screen">
      <header className="border-b border-border/50 backdrop-blur sticky top-0 z-10 bg-background/70">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <button onClick={() => setTab("home")} className="flex items-center gap-2">
            <span className="text-2xl">⚡</span>
            <span className="text-xl font-black tracking-tight text-rgb">GK TOOLS</span>
          </button>
          <nav className="flex gap-1">
            <TabBtn active={tab === "home"} onClick={() => setTab("home")}>Home</TabBtn>
            <TabBtn active={tab === "meme"} onClick={() => setTab("meme")}>Mémgenerátor</TabBtn>
            <TabBtn active={tab === "image"} onClick={() => setTab("image")}>Kép eszköz</TabBtn>
            <TabBtn active={tab === "blur"} onClick={() => setTab("blur")}>Arc kitakaró</TabBtn>
            <TabBtn active={tab === "video"} onClick={() => setTab("video")}>Videó</TabBtn>
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-10">
        {tab === "home" ? <HomeView onPick={setTab} /> : null}
        {tab === "meme" ? (
          <section>
            <h2 className="text-3xl md:text-4xl font-black mb-1">
              <span className="text-rgb">Mémgenerátor</span>
            </h2>
            <p className="text-muted-foreground mb-6">Húzz be egy képet, állítsd a sávot, írd meg a szöveged.</p>
            <MemeGenerator />
          </section>
        ) : null}
        {tab === "image" ? (
          <section>
            <h2 className="text-3xl md:text-4xl font-black mb-1">
              <span className="text-rgb">Kép tömörítő & Resize</span>
            </h2>
            <p className="text-muted-foreground mb-6">Tömöríts pontos méretre vagy állíts be új felbontást.</p>
            <ImageCompressor />
          </section>
        ) : null}
        {tab === "blur" ? (
          <section>
            <h2 className="text-3xl md:text-4xl font-black mb-1">
              <span className="text-rgb">Arc kitakaró</span>
            </h2>
            <p className="text-muted-foreground mb-6">Rajzolj téglalapot a kitakarni kívánt részekre.</p>
            <FaceBlur />
          </section>
        ) : null}
        {tab === "video" ? (
          <section>
            <h2 className="text-3xl md:text-4xl font-black mb-1">
              <span className="text-rgb">Videó vágó + smart mute</span>
            </h2>
            <p className="text-muted-foreground mb-6">
              Vágd a videót, jelölj ki némítandó részeket, majd az AI megkeresi és lenémítja az összes hasonló hangot.
            </p>
            <VideoEditor />
          </section>
        ) : null}
      </main>
    </div>
  );
}

function HomeView({ onPick }: { onPick: (t: Tab) => void }) {
  return (
    <>
      <section className="text-center py-12 md:py-20">
        <h1 className="text-5xl md:text-7xl font-black tracking-tight mb-4">
          <span className="text-rgb">Kreatív eszközök.</span>
          <br />
          <span className="text-foreground">Nulla bullshit.</span>
        </h1>
        <p className="text-lg text-muted-foreground max-w-xl mx-auto">
          Egy gyors gyűjtemény böngészőből futó eszközökhöz. Válassz egyet és kezdj alkotni.
        </p>
      </section>

      <section className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {tools.map((t) => (
          <button
            key={t.id}
            disabled={!t.ready}
            onClick={() => t.ready && onPick(t.id as Tab)}
            className="group text-left p-6 rounded-2xl border border-border bg-card/60 backdrop-blur hover:border-primary/60 hover:shadow-[0_0_40px_-10px_oklch(0.7_0.25_330_/_0.6)] transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <div className="text-4xl mb-3">{t.icon}</div>
            <h2 className="text-lg font-bold mb-1 group-hover:text-rgb transition">{t.name}</h2>
            <p className="text-sm text-muted-foreground">{t.desc}</p>
            {!t.ready && (
              <span className="inline-block mt-3 text-[10px] uppercase tracking-wider px-2 py-1 rounded-full bg-muted text-muted-foreground">Soon</span>
            )}
          </button>
        ))}
      </section>
    </>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
        active
          ? "bg-primary text-primary-foreground shadow-[0_0_20px_-5px_oklch(0.7_0.25_330_/_0.7)]"
          : "text-muted-foreground hover:text-foreground hover:bg-card/60"
      }`}
    >
      {children}
    </button>
  );
}
