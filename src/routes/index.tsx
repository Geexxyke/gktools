import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  ArrowRight,
  ChevronRight,
  Crop,
  EyeOff,
  FileArchive,
  Film,
  ImageDown,
  ImageUp,
  Layers,
  Link as LinkIcon,
  Repeat,
  Scissors,
  ShieldCheck,
  Type,
  Wrench,
  Zap,
} from "lucide-react";
const MemeGenerator = lazy(() => import("@/components/MemeGenerator").then((m) => ({ default: m.MemeGenerator })));
const ImageCompressor = lazy(() => import("@/components/ImageCompressor").then((m) => ({ default: m.ImageCompressor })));
const FaceBlur = lazy(() => import("@/components/FaceBlur").then((m) => ({ default: m.FaceBlur })));
const VideoEditor = lazy(() => import("@/components/VideoEditor").then((m) => ({ default: m.VideoEditor })));
const FileZipper = lazy(() => import("@/components/FileZipper").then((m) => ({ default: m.FileZipper })));
const BgRemover = lazy(() => import("@/components/BgRemover").then((m) => ({ default: m.BgRemover })));
const FileConverter = lazy(() => import("@/components/FileConverter").then((m) => ({ default: m.FileConverter })));
const ImageHost = lazy(() => import("@/components/ImageHost").then((m) => ({ default: m.ImageHost })));

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "GK Tools — Browser-based media utilities by Geexxyke" },
      {
        name: "description",
        content:
          "A precise suite of media utilities that run fully in your browser: caption composer, image compression, background removal, face redaction, video editing, archiving and conversion.",
      },
      { property: "og:title", content: "GK Tools — Browser-based media utilities by Geexxyke" },
      {
        property: "og:description",
        content:
          "Caption composer, image compression, background removal, face redaction, video editing, archiving and conversion — all local, all fast.",
      },
      { property: "og:url", content: "https://gktools.lovable.app/" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://gktools.lovable.app/" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: "GK Tools",
          url: "https://gktools.lovable.app/",
          description:
            "Browser-based media utilities: caption composer, image compression, background removal, face redaction, video editing, archiving and conversion.",
          author: {
            "@type": "Person",
            name: "Geexxyke",
            url: "https://fakecrime.bio/geexxyke",
          },
        }),
      },
    ],
  }),
  component: Home,
});

type Section = "home" | "tools" | "about";
type AddonId = "meme" | "image" | "blur" | "video" | "zip" | "bg" | "convert" | "host";

type Addon = {
  id: AddonId;
  name: string;
  tag: string;
  Icon: typeof Type;
  desc: string;
  heading: string;
  sub: string;
};

const addons: Addon[] = [
  {
    id: "meme",
    name: "Caption Composer",
    tag: "Image",
    Icon: Type,
    desc: "Add a clean top caption band with heavy display type, full control over weight, outline and colour.",
    heading: "Caption Composer",
    sub: "Drop an image, size the caption band, and typeset your headline with precise control.",
  },
  {
    id: "image",
    name: "Compress & Resize",
    tag: "Image",
    Icon: ImageDown,
    desc: "Hit an exact file size in MB, or resize to exact pixel dimensions. Animated GIFs supported.",
    heading: "Compress & Resize",
    sub: "Target an exact output size, or set exact pixel dimensions — including animated GIFs.",
  },
  {
    id: "blur",
    name: "Face Redaction",
    tag: "Privacy",
    Icon: EyeOff,
    desc: "Broadcast-grade blur, pixelation or blackout with a brush or rectangle selection.",
    heading: "Face Redaction",
    sub: "Paint over faces and plates with heavy blur, grid pixelation or a solid blackout.",
  },
  {
    id: "video",
    name: "Video Editor",
    tag: "Video",
    Icon: Film,
    desc: "Non-linear timeline: split, reorder, delete and mute segments, plus similarity-based smart mute.",
    heading: "Video Editor",
    sub: "Split at the playhead, reorder or drop segments, mute ranges, and let smart mute catch the rest.",
  },
  {
    id: "zip",
    name: "Archive Builder",
    tag: "Files",
    Icon: FileArchive,
    desc: "Pack multiple files into a maximally compressed ZIP with an optional target size.",
    heading: "Archive Builder",
    sub: "Drop files in, get a maximum-compression ZIP — with an optional target size budget.",
  },
  {
    id: "bg",
    name: "Background Remover",
    tag: "Image",
    Icon: Scissors,
    desc: "Lossless transparent PNG cutouts, plus horizontal and vertical mirroring.",
    heading: "Background Remover",
    sub: "Cut the background to a full-resolution transparent PNG, and mirror the subject if needed.",
  },
  {
    id: "convert",
    name: "File Converter",
    tag: "Files",
    Icon: Repeat,
    desc: "Convert any raster image into GIF with palette and size controls.",
    heading: "File Converter",
    sub: "Convert PNG, JPG, WEBP, BMP or SVG artwork into GIF with palette and width control.",
  },
  {
    id: "host",
    name: "Image to URL",
    tag: "Hosting",
    Icon: ImageUp,
    desc: "Upload an image and get a permanent direct link that embeds in Discord, bots and forums.",
    heading: "Image to URL",
    sub: "Drop an image in, copy the direct link, and paste it anywhere an image URL is expected.",
  },
];


function Home() {
  const [section, setSection] = useState<Section>("home");
  const [addon, setAddon] = useState<AddonId | null>(null);

  const active = addons.find((a) => a.id === addon) ?? null;

  const go = (s: Section) => {
    setSection(s);
    setAddon(null);
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border/60 backdrop-blur-xl sticky top-0 z-20 bg-background/80">
        <div className="max-w-6xl mx-auto px-4 sm:px-5 min-h-16 py-2 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 sm:gap-6">
          <Button variant="plain" size="natural" onClick={() => go("home")} className="flex items-center gap-2.5 shrink-0">
            <span className="grid place-items-center size-8 rounded-md border border-border bg-card">
              <Zap className="size-4 text-primary" />
            </span>
            <span className="truncate text-sm sm:text-base font-bold font-mono">GK TOOLS</span>
          </Button>
          <nav className="flex shrink-0 items-center gap-0.5 sm:gap-1" aria-label="Main navigation">
            <NavBtn active={section === "home"} onClick={() => go("home")}>
              Home
            </NavBtn>
            <NavBtn active={section === "tools"} onClick={() => go("tools")} Icon={Wrench}>
              Tools
            </NavBtn>
            <NavBtn active={section === "about"} onClick={() => go("about")}>
              About
            </NavBtn>
          </nav>
        </div>
      </header>

      <main className="flex-1 max-w-6xl w-full min-w-0 mx-auto px-4 sm:px-5 py-6 sm:py-12">
        {section === "home" && <HomeView onOpen={(id) => { setSection("tools"); setAddon(id); }} onSection={go} />}


        {section === "tools" && !active && (
          <>
            <PageHead
              label="Tools"
              title="Media utilities"
              desc="Media processing stays on your device. Image to URL uploads only the images you choose to share."
            />
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {addons.map((a) => (
                <AddonCard key={a.id} addon={a} onClick={() => setAddon(a.id)} />
              ))}
            </div>
          </>
        )}

        {section === "tools" && active && (
          <section className="min-w-0 tool-workspace">
            <Button variant="plain" size="natural"
              onClick={() => setAddon(null)}
              className="mono-label inline-flex items-center gap-1.5 hover:text-foreground transition mb-5"
            >
              <ArrowLeft className="size-3.5" /> All tools
            </Button>
            <div className="flex items-start gap-3 mb-8">
              <span className="grid place-items-center size-10 rounded-lg border border-border bg-card shrink-0">
                <active.Icon className="size-5 text-primary" />
              </span>
              <div className="min-w-0">
                <h1 className="text-2xl md:text-3xl font-bold">{active.heading}</h1>
                <p className="text-sm text-muted-foreground mt-1 max-w-2xl">{active.sub}</p>
              </div>
            </div>
            <Suspense fallback={<p className="py-8 text-sm text-muted-foreground" role="status">Loading tool…</p>}>
            {active.id === "meme" && <MemeGenerator />}
            {active.id === "image" && <ImageCompressor />}
            {active.id === "blur" && <FaceBlur />}
            {active.id === "video" && <VideoEditor />}
            {active.id === "zip" && <FileZipper />}
            {active.id === "bg" && <BgRemover />}
            {active.id === "convert" && <FileConverter />}
            {active.id === "host" && <ImageHost />}
            </Suspense>
          </section>
        )}

        {section === "about" && <AboutView />}
      </main>

      <footer className="border-t border-border/60 mt-8">
        <div className="max-w-6xl mx-auto px-5 py-6 flex flex-wrap items-center justify-between gap-3">
          <p className="mono-label">GK Tools — built by Geexxyke</p>
          <a
            href="https://fakecrime.bio/geexxyke"
            target="_blank"
            rel="noopener noreferrer"
            className="mono-label inline-flex items-center gap-1.5 hover:text-foreground transition"
          >
            <LinkIcon className="size-3.5" /> fakecrime.bio/geexxyke
          </a>
        </div>
      </footer>
    </div>
  );
}

function PageHead({ label, title, desc }: { label: string; title: string; desc: string }) {
  return (
    <div className="mb-8 max-w-2xl">
      <p className="mono-label">{label}</p>
      <h1 className="text-3xl md:text-4xl font-bold mt-2">{title}</h1>
      <p className="text-sm text-muted-foreground mt-3 leading-relaxed">{desc}</p>
    </div>
  );
}

function HomeView({
  onOpen,
  onSection,
}: {
  onOpen: (id: AddonId) => void;
  onSection: (s: Section) => void;
}) {
  return (
    <>
      <section className="py-5 sm:py-10 md:py-16 border-b border-border/60">
        <p className="mono-label">Local-first media toolkit</p>
        <h1 className="text-3xl sm:text-4xl md:text-6xl font-bold mt-4 max-w-3xl leading-[1.05]">
          <span className="text-rgb">Precision media tools</span>
          <br />
          <span className="text-foreground">that never leave your device.</span>
        </h1>
        <p className="text-base text-muted-foreground max-w-xl mt-5 leading-relaxed">
          A focused set of utilities for images, video and files — engineered for exact output, no
          accounts, no uploads, no watermarks.
        </p>
        <div className="flex flex-wrap gap-2 mt-8">
          <Button variant="plain" size="natural"
            onClick={() => onSection("tools")}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition"
          >
            Browse tools <ArrowRight className="size-4" />
          </Button>
          <Button variant="plain" size="natural"
            onClick={() => onSection("about")}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md border border-border text-sm font-semibold hover:bg-card transition"
          >
            About the creator
          </Button>
        </div>
        <dl className="grid sm:grid-cols-3 gap-3 mt-12">
          {[
            { Icon: ShieldCheck, k: "Fully local", v: "Processing happens in your browser only." },
            { Icon: Crop, k: "Exact output", v: "Byte-level size and pixel-level dimensions." },
            { Icon: Layers, k: "No sign-up", v: "Open a tool and start working instantly." },
          ].map((f) => (
            <div key={f.k} className="rounded-lg border border-border bg-card/50 p-4">
              <f.Icon className="size-4 text-primary" />
              <dt className="text-sm font-semibold mt-3">{f.k}</dt>
              <dd className="text-xs text-muted-foreground mt-1 leading-relaxed">{f.v}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="py-12">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3 mb-5">
          <div>
            <p className="mono-label">Tools</p>
            <h2 className="text-2xl font-bold mt-1.5">Available now</h2>
          </div>
          <Button variant="plain" size="natural"
            onClick={() => onSection("tools")}
            className="mono-label inline-flex items-center gap-1.5 hover:text-foreground transition"
          >
            View all <ChevronRight className="size-3.5" />
          </Button>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {addons.map((a) => (
            <AddonCard key={a.id} addon={a} onClick={() => onOpen(a.id)} />
          ))}
        </div>
      </section>
    </>
  );
}

function AddonCard({ addon, onClick }: { addon: Addon; onClick: () => void }) {
  return (
    <Button variant="plain" size="natural"
      onClick={onClick}
      className="group text-left p-5 rounded-lg border border-border bg-card/50 hover:border-primary/50 hover:bg-card transition"
    >
      <div className="flex items-center justify-between">
        <span className="grid place-items-center size-9 rounded-md border border-border bg-background/60">
          <addon.Icon className="size-4 text-primary" />
        </span>
        <span className="mono-label">{addon.tag}</span>
      </div>
      <h3 className="text-base font-semibold mt-4 group-hover:text-primary transition">
        {addon.name}
      </h3>
      <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{addon.desc}</p>
    </Button>
  );
}

function AboutView() {
  return (
    <>
      <PageHead
        label="About"
        title="Built by Geexxyke"
        desc="GK Tools is a personal engineering project — a growing collection of media utilities built to solve real workflow problems without ads, uploads or accounts."
      />
      <div className="grid md:grid-cols-[1.4fr_1fr] gap-3">
        <article className="rounded-lg border border-border bg-card/50 p-6">
          <h2 className="text-lg font-semibold">The creator</h2>
          <div className="text-sm text-muted-foreground mt-3 space-y-3 leading-relaxed">
            <p>
              I go by <span className="text-foreground font-semibold">Geexxyke</span>. I build small,
              sharp software: things that do exactly one job, do it fast, and get out of the way.
            </p>
            <p>
              GK Tools started as a single caption tool and grew into a full local media suite —
              compression with real size targets, broadcast-style redaction, a non-linear video
              timeline, background cutouts and format conversion. Everything runs client-side, so
              your files stay yours.
            </p>
            <p>
              New media utilities land regularly under Tools.
            </p>
          </div>
          <a
            href="https://fakecrime.bio/geexxyke"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 mt-6 px-4 py-2.5 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition"
          >
            <LinkIcon className="size-4" /> fakecrime.bio/geexxyke
          </a>
        </article>
        <aside className="rounded-lg border border-border bg-card/50 p-6">
          <h2 className="text-lg font-semibold">Principles</h2>
          <ul className="mt-4 space-y-4">
            {[
              { k: "Privacy by architecture", v: "No server round-trip means nothing to leak." },
              { k: "Exactness over guessing", v: "Numbers you enter are the numbers you get." },
              { k: "Zero friction", v: "No login walls, no trials, no watermarks." },
            ].map((p) => (
              <li key={p.k}>
                <p className="text-sm font-semibold">{p.k}</p>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{p.v}</p>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </>
  );
}

function NavBtn({
  active,
  onClick,
  children,
  Icon,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  Icon?: typeof Wrench;
}) {
  return (
    <Button variant="plain" size="natural"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition ${
        active
          ? "bg-secondary text-foreground"
          : "text-muted-foreground hover:text-foreground hover:bg-card/70"
      }`}
    >
      {Icon ? <Icon className="hidden sm:block size-3.5 shrink-0" /> : null}
      {children}
    </Button>
  );
}
