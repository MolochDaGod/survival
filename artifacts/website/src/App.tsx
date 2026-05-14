import { useRef } from "react";
import {
  motion,
  useScroll,
  useTransform,
  useInView,
} from "framer-motion";
import {
  Sword,
  Hammer,
  Skull,
  MessageCircle,
  Cpu,
  Cloud,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Real game content (mirrors arpg-game/src/data/bestiary.ts and
// arpg-game/public/lore/grudges-compendium.md). Keeping the canonical
// data inline here so the marketing copy stays in lockstep with the
// in-game compendium and bestiary entries — if those source files change,
// update this list.
// ─────────────────────────────────────────────────────────────────────────────

interface BestiaryRow {
  name: string;
  classification: string;
  threat: 1 | 2 | 3 | 4 | 5;
  habitat: string;
  lore: string;
  accent: string;
}

const BESTIARY: BestiaryRow[] = [
  {
    name: "Hollow Jester",
    classification: "Abomination · Humanoid",
    threat: 3,
    habitat: "Abandoned carnivals · Urban ruins",
    lore: "Their painted grins are seared into the bone, and their laughter precedes them by several seconds — a delayed echo from somewhere just on the wrong side of reality.",
    accent: "#e84060",
  },
  {
    name: "Frost Surgeon",
    classification: "Ranged · Construct",
    threat: 4,
    habitat: "Hospital ruins · Quarantine zones",
    lore: 'They will pursue any wounded survivor across miles of terrain to "complete the procedure" — and the outcome is never in the patient\'s favour.',
    accent: "#80c0ff",
  },
  {
    name: "Veil Stalker",
    classification: "Stealth · Humanoid",
    threat: 4,
    habitat: "Forests at dusk · Sewer networks",
    lore: "They do not roar. They whisper your name from a direction you can never quite locate.",
    accent: "#666666",
  },
  {
    name: "Tunnel Wretch",
    classification: "Brute · Mutated",
    threat: 2,
    habitat: "Caves · Mineshafts · Collapsed buildings",
    lore: "Buried alive when the rift opened, these miners adapted. Their lungs no longer require air — only the dark wet smell of stone.",
    accent: "#aa8855",
  },
  {
    name: "Husk Watcher",
    classification: "Sentinel · Construct",
    threat: 3,
    habitat: "Cornfields · Farmsteads · Crossroads",
    lore: "Stand perfectly still and the Husk Watcher will not move. Look away and turn back, and it has somehow taken three steps closer.",
    accent: "#ccaa44",
  },
  {
    name: "Drowned Diver",
    classification: "Aquatic · Ranged",
    threat: 3,
    habitat: "Coastlines · Flooded basements · Old docks",
    lore: "Their suits are still pressurised from the dive that killed them. Inside, the water remembers.",
    accent: "#3377cc",
  },
];

const PILLARS = [
  {
    title: "Vendetta Combat",
    description:
      "Action-RPG melee and ranged loops against six classes of horror — each with its own movement archetype, weakness profile, and tell.",
    icon: <Sword className="h-6 w-6" />,
  },
  {
    title: "Salvage & Build",
    description:
      "Place foundations, walls, doors, and roofs from scrap. Break ruined walls for ore, timber, and forgotten pre-Schism electronics.",
    icon: <Hammer className="h-6 w-6" />,
  },
  {
    title: "Perks & Specialisation",
    description:
      "Earn perk points across nine tiers. Read tile descriptions inline; preview every branch before you commit.",
    icon: <Cpu className="h-6 w-6" />,
  },
  {
    title: "Townsfolk With Memory",
    description:
      "Ambient NPCs carry barker lines tied to the Compendium. Attack them and the whole settlement remembers.",
    icon: <MessageCircle className="h-6 w-6" />,
  },
  {
    title: "A World That Forgot You",
    description:
      "Atmospheric weather, dynamic day/night, fog rolling across river crossings the cartographers stopped naming three centuries ago.",
    icon: <Cloud className="h-6 w-6" />,
  },
  {
    title: "Bestiary as Lore",
    description:
      "Every kill earns a page. Threat tiers, habitats, weaknesses, tactical notes — the only field guide left on the surface.",
    icon: <Skull className="h-6 w-6" />,
  },
];

const PATHS = [
  {
    label: "Path One",
    title: "Ascension",
    pct: "12%",
    body: "Augmentation. Citizenship. The stars. Earth left behind forever, mined to extinction. Their genetic legacy preserved among the Way's interstellar alliance.",
  },
  {
    label: "Path Two",
    title: "Stewardship",
    pct: "68%",
    body: "Stratospheric habitats held aloft by anti-gravity cores. Bound by the Charter to deliver resource quotas. They watch the homeworld be hollowed out from above.",
  },
  {
    label: "The Third Path",
    title: "The Denied",
    pct: "20%",
    body: "Some refused both. Their descendants are the surface tribes — the Grudges. The station-dwellers gave us the name as an insult. We took it.",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const img = (file: string) => `${import.meta.env.BASE_URL}images/${file}`;

function FadeIn({
  children,
  delay = 0,
  y = 30,
}: {
  children: React.ReactNode;
  delay?: number;
  y?: number;
}) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-15%" });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y }}
      animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y }}
      transition={{ duration: 1.0, delay, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sections
// ─────────────────────────────────────────────────────────────────────────────

function TopNav() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 px-6 md:px-10 py-5 flex items-center justify-between bg-gradient-to-b from-black/70 via-black/30 to-transparent backdrop-blur-[2px]">
      <div className="flex items-baseline gap-3 font-serif">
        <span className="text-secondary text-xl tracking-[0.3em] font-bold">
          GRUDGES
        </span>
        <span className="hidden sm:inline text-muted-foreground/70 text-xs tracking-widest uppercase">
          343 PC · Surface Bulletin
        </span>
      </div>
      <a
        href="/arpg-game/"
        className="font-serif tracking-widest text-xs md:text-sm uppercase border border-secondary/40 px-3 md:px-4 py-2 hover:bg-secondary hover:text-black transition-colors duration-500"
      >
        Enter the Surface
      </a>
    </nav>
  );
}

function Hero() {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });
  const yBg = useTransform(scrollYProgress, [0, 1], ["0%", "30%"]);
  const opacity = useTransform(scrollYProgress, [0, 0.7], [1, 0]);

  return (
    <section
      ref={ref}
      className="relative h-screen flex items-center justify-center overflow-hidden"
    >
      <motion.div style={{ y: yBg }} className="absolute inset-0 z-0">
        <img
          src={img("hero-cathedral.png")}
          alt="A ruined cathedral on the surface, three centuries after the Schism"
          className="w-full h-full object-cover object-center scale-105"
        />
        <div className="absolute inset-0 bg-black/55 z-10" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/30 to-transparent z-20" />
      </motion.div>

      <motion.div
        style={{ opacity }}
        className="relative z-30 text-center flex flex-col items-center px-4 max-w-5xl"
      >
        <FadeIn delay={0.3}>
          <div className="flex items-center justify-center gap-3 text-secondary tracking-[0.4em] text-[10px] md:text-xs mb-4 uppercase font-medium">
            <span className="w-8 h-px bg-secondary/60" />
            <span>Year 2398 OEY · 343 Post-Contact</span>
            <span className="w-8 h-px bg-secondary/60" />
          </div>
        </FadeIn>

        <FadeIn delay={0.5}>
          <h1
            className="font-serif font-bold text-foreground leading-[0.85] mb-4"
            style={{
              fontSize: "clamp(4.5rem, 13vw, 12rem)",
              letterSpacing: "-0.035em",
              textShadow:
                "0 2px 8px rgba(0,0,0,0.95), 0 8px 32px rgba(0,0,0,0.8), 0 0 60px rgba(0,0,0,0.6)",
            }}
          >
            GRUDG<span className="text-primary">ES</span>
          </h1>
        </FadeIn>

        <FadeIn delay={0.7}>
          <p className="font-serif italic text-2xl md:text-3xl text-secondary/90 mb-10 tracking-wide">
            Bind a grudge. Bear it forward.
          </p>
        </FadeIn>

        <FadeIn delay={0.9}>
          <p className="max-w-xl text-sm md:text-base text-foreground/75 font-light mb-12 leading-relaxed">
            They left us behind. Twelve percent went to the stars. Sixty-eight
            percent rose to the stratocolonies. The rest of us stayed on the
            surface and learned how to bury our own. Three hundred years later,
            the rift is still open, and so are old wounds.
          </p>
        </FadeIn>

        <FadeIn delay={1.1}>
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <a
              href="/arpg-game/"
              className="group relative inline-flex items-center justify-center px-10 py-4 font-serif text-base md:text-lg tracking-[0.25em] text-white uppercase bg-primary overflow-hidden transition-all hover:scale-105 duration-500 ease-out shadow-[0_0_40px_rgba(180,40,60,0.35)]"
            >
              <div className="absolute inset-0 bg-white/15 translate-y-full group-hover:translate-y-0 transition-transform duration-500 ease-out" />
              <span className="relative z-10">Play Now</span>
            </a>
            <a
              href="#compendium"
              className="font-serif tracking-[0.25em] text-xs md:text-sm uppercase text-muted-foreground hover:text-secondary transition-colors duration-300"
            >
              Read the Compendium ↓
            </a>
          </div>
        </FadeIn>
      </motion.div>

      {/* Scroll indicator */}
      <motion.div
        animate={{ y: [0, 8, 0], opacity: [0.4, 0.9, 0.4] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
        className="absolute bottom-10 left-1/2 -translate-x-1/2 z-30 text-secondary/70 font-serif tracking-[0.4em] text-[10px] uppercase"
      >
        Descend
      </motion.div>
    </section>
  );
}

function ColdOpen() {
  return (
    <section
      id="compendium"
      className="relative py-32 px-6 md:px-12 max-w-5xl mx-auto z-20"
    >
      <FadeIn>
        <div className="text-center">
          <div className="text-secondary tracking-[0.35em] text-xs uppercase mb-8">
            Compendium · Part I
          </div>
          <h2 className="font-serif text-3xl md:text-5xl text-foreground mb-10 leading-tight">
            "By the mid-21st century, Earth was in terminal decline.
            <br />
            <span className="text-secondary">Then in 2055, they came.</span>"
          </h2>
          <div className="w-px h-20 bg-border mx-auto mb-10" />
          <p className="text-base md:text-xl font-light text-muted-foreground leading-relaxed max-w-3xl mx-auto">
            They emerged from a warp tear two hundred kilometres above the
            Pacific. No invasion. No ultimatum. Just a single vessel, smooth and
            silent, hanging in geostationary orbit for seventy-two hours while
            the world panicked.
            <br />
            <br />
            They called themselves <em className="text-foreground">The Way</em>.
            They were us, separated by tens of thousands of years of divergent
            evolution. Their message was four sentences long. The fourth was a
            choice: leave the planet, or watch it be mined.
            <br />
            <br />
            <span className="text-secondary/90 font-serif italic">
              Some of us refused both.
            </span>
          </p>
        </div>
      </FadeIn>
    </section>
  );
}

function ThreePaths() {
  return (
    <section className="relative py-24 bg-black/40 border-y border-border/40">
      <div className="max-w-7xl mx-auto px-6 md:px-12">
        <FadeIn>
          <div className="text-center mb-16">
            <div className="text-secondary tracking-[0.35em] text-xs uppercase mb-4">
              The Schism · 2056–2062
            </div>
            <h2 className="font-serif text-4xl md:text-6xl text-foreground">
              Three Paths.{" "}
              <span className="text-secondary">One Planet.</span>
            </h2>
          </div>
        </FadeIn>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {PATHS.map((p, i) => (
            <FadeIn key={p.title} delay={i * 0.15}>
              <div className="group relative h-full p-8 border border-border/40 bg-black/30 hover:border-secondary/40 transition-colors duration-500">
                <div className="text-secondary/80 tracking-[0.3em] text-[10px] uppercase mb-3">
                  {p.label}
                </div>
                <h3 className="font-serif text-3xl text-foreground mb-2">
                  {p.title}
                </h3>
                <div className="font-serif text-5xl text-primary mb-6 leading-none">
                  {p.pct}
                </div>
                <p className="text-muted-foreground leading-relaxed text-sm md:text-base">
                  {p.body}
                </p>
                {p.title === "The Denied" && (
                  <div className="absolute top-6 right-6 font-serif italic text-secondary tracking-wide text-sm">
                    ← you
                  </div>
                )}
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  );
}

function PillarsSection() {
  return (
    <section className="relative py-24">
      <div className="max-w-6xl mx-auto px-6 md:px-12">
        <FadeIn>
          <div className="mb-12 flex items-end justify-between gap-6 border-b border-border/40 pb-6">
            <div>
              <div className="text-secondary tracking-[0.35em] text-[10px] uppercase mb-3">
                Field Manual · §I–VI
              </div>
              <h2 className="font-serif text-3xl md:text-5xl text-foreground leading-[0.95]">
                What you do on the surface.
              </h2>
            </div>
            <div className="hidden md:block font-serif italic text-muted-foreground/60 text-sm tracking-wide shrink-0">
              Six disciplines. No shortcuts.
            </div>
          </div>
        </FadeIn>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px bg-border/25">
          {PILLARS.map((p, i) => (
            <FadeIn key={p.title} delay={i * 0.04}>
              <div className="group h-full bg-background px-5 py-6 hover:bg-black/40 transition-colors duration-500 flex gap-4">
                <div className="shrink-0 text-secondary/80 group-hover:text-secondary transition-colors mt-0.5 [&>svg]:h-4 [&>svg]:w-4">
                  {p.icon}
                </div>
                <div className="min-w-0">
                  <div className="flex items-baseline gap-2 mb-1.5">
                    <span className="font-serif text-[10px] tracking-[0.25em] text-muted-foreground/60 uppercase">
                      §{String(i + 1).padStart(2, "0")}
                    </span>
                    <h3 className="font-serif text-base text-foreground leading-tight">
                      {p.title}
                    </h3>
                  </div>
                  <p className="text-muted-foreground/85 leading-snug text-[13px]">
                    {p.description}
                  </p>
                </div>
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  );
}

function BestiarySection() {
  return (
    <section className="relative py-32 overflow-hidden">
      <div className="absolute inset-0 z-0">
        <img
          src={img("blood-moon-monster.png")}
          alt=""
          className="w-full h-full object-cover object-right opacity-30 grayscale-[0.4]"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-background via-background/95 to-background/40" />
      </div>
      <div className="relative z-10 max-w-7xl mx-auto px-6 md:px-12">
        <FadeIn>
          <div className="mb-16 max-w-3xl">
            <div className="text-primary tracking-[0.35em] text-xs uppercase mb-4">
              Bestiary · Six Classifications Confirmed
            </div>
            <h2 className="font-serif text-4xl md:text-6xl text-foreground leading-tight mb-6">
              The things that crawled out{" "}
              <span className="text-primary">when the rift opened.</span>
            </h2>
            <p className="text-muted-foreground text-base md:text-lg leading-relaxed max-w-2xl">
              Every confirmed kill earns a Compendium page: threat tier,
              habitat, weaknesses, and a field note left by whoever logged the
              entry first. Here are the six the surface knows by name.
            </p>
          </div>
        </FadeIn>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-border/40">
          {BESTIARY.map((m, i) => (
            <FadeIn key={m.name} delay={i * 0.07}>
              <article className="h-full bg-background/95 p-7 group hover:bg-black/60 transition-colors duration-500 border-l-2 border-l-transparent hover:border-l-primary">
                <div className="flex items-start justify-between mb-3">
                  <h3
                    className="font-serif text-2xl text-foreground"
                    style={{ color: m.accent }}
                  >
                    {m.name}
                  </h3>
                  <div className="flex gap-0.5 mt-2 shrink-0">
                    {Array.from({ length: 5 }).map((_, idx) => (
                      <span
                        key={idx}
                        className={`w-1.5 h-4 ${
                          idx < m.threat ? "bg-primary" : "bg-border/60"
                        }`}
                        aria-hidden
                      />
                    ))}
                  </div>
                </div>
                <div className="font-serif text-[11px] tracking-[0.2em] text-muted-foreground/80 uppercase mb-2">
                  {m.classification}
                </div>
                <div className="text-xs text-muted-foreground/70 mb-5 italic">
                  Habitat: {m.habitat}
                </div>
                <p className="text-sm text-muted-foreground/95 leading-relaxed">
                  {m.lore}
                </p>
              </article>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  );
}

function BuildSection() {
  return (
    <section className="relative py-32 overflow-hidden">
      <div className="absolute inset-0 z-0">
        <img
          src={img("forge-interior.png")}
          alt=""
          className="w-full h-full object-cover object-left opacity-30"
        />
        <div className="absolute inset-0 bg-gradient-to-l from-background via-background/95 to-background/40" />
      </div>
      <div className="relative z-10 max-w-7xl mx-auto px-6 md:px-12 grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
        <div className="lg:col-start-2">
          <FadeIn>
            <Hammer className="w-12 h-12 text-secondary mb-6" />
            <div className="text-secondary tracking-[0.35em] text-xs uppercase mb-4">
              Stewardship · Charter Forbids It · Do It Anyway
            </div>
            <h2 className="font-serif text-4xl md:text-6xl text-foreground leading-tight mb-6">
              Rebuild what the stations decided wasn't worth saving.
            </h2>
            <p className="text-muted-foreground text-base md:text-lg leading-relaxed mb-8">
              Pre-Contact concrete still holds, if you patch it. Drop a
              foundation, raise four walls, hang a door, and you have what the
              old codex calls a <em>house</em>. Add a roof and the rain stops
              being your problem.
            </p>
            <ul className="space-y-3 text-muted-foreground/90 font-serif text-sm md:text-base">
              <li className="flex gap-3">
                <span className="text-primary">›</span> Foundations, walls,
                doors, roofs — placed in real space, not on a grid you can't see
              </li>
              <li className="flex gap-3">
                <span className="text-primary">›</span> Salvage scrap from
                breakable ruins; smelt iron in a forge you built yourself
              </li>
              <li className="flex gap-3">
                <span className="text-primary">›</span> The horde respects
                walls. Mostly.
              </li>
            </ul>
          </FadeIn>
        </div>
      </div>
    </section>
  );
}

function VoicesSection() {
  return (
    <section className="relative py-32 bg-black/50 border-y border-border/40">
      <div className="max-w-4xl mx-auto px-6 md:px-12 space-y-20">
        <FadeIn>
          <div className="text-center mb-12">
            <div className="text-secondary tracking-[0.35em] text-xs uppercase mb-4">
              Townsfolk · Overheard
            </div>
            <h2 className="font-serif text-3xl md:text-5xl text-foreground">
              Walk into any settlement and listen.
            </h2>
          </div>
        </FadeIn>

        <FadeIn delay={0.1}>
          <blockquote className="text-2xl md:text-4xl font-serif italic text-foreground leading-relaxed">
            "The grudge runs deep here.
            <br />
            <span className="text-secondary">Watch your back.</span>"
          </blockquote>
        </FadeIn>

        <FadeIn delay={0.2}>
          <blockquote className="text-2xl md:text-4xl font-serif italic text-muted-foreground leading-relaxed text-right">
            "Don't go past the river after dark.
            <br />
            <span className="text-foreground">Things wander out there.</span>"
          </blockquote>
        </FadeIn>

        <FadeIn delay={0.3}>
          <blockquote className="text-2xl md:text-4xl font-serif italic text-foreground leading-relaxed">
            "Heard the bells last night?
            <br />
            <span className="text-primary">Something's coming.</span>"
          </blockquote>
        </FadeIn>

        <FadeIn delay={0.4}>
          <blockquote className="text-2xl md:text-4xl font-serif italic text-muted-foreground leading-relaxed text-right">
            "My son was a guard.
            <br />
            <span className="text-foreground">The rift took him.</span>"
          </blockquote>
        </FadeIn>

        <FadeIn delay={0.5}>
          <p className="text-center text-sm text-muted-foreground/70 italic font-serif tracking-wide pt-8">
            Attack one, and the whole town remembers.
          </p>
        </FadeIn>
      </div>
    </section>
  );
}

function FinalCTA() {
  return (
    <section className="relative h-screen flex flex-col items-center justify-center overflow-hidden">
      <div className="absolute inset-0 z-0">
        <img
          src={img("distant-church.png")}
          alt=""
          className="w-full h-full object-cover object-bottom opacity-50"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background/70 via-background/40 to-black/85" />
      </div>
      <div className="relative z-10 text-center px-4 max-w-3xl">
        <FadeIn>
          <div className="text-secondary tracking-[0.4em] text-[10px] md:text-xs uppercase mb-6">
            Surface Bulletin · Year 343 PC
          </div>
          <h2
            className="font-serif text-5xl md:text-7xl lg:text-8xl mb-4 text-foreground leading-tight"
            style={{
              textShadow:
                "0 2px 8px rgba(0,0,0,0.9), 0 8px 32px rgba(0,0,0,0.8)",
            }}
          >
            The stars don't owe us anything.
          </h2>
          <p className="font-serif italic text-xl md:text-2xl text-secondary mb-12">
            And we don't owe them anything either.
          </p>
          <a
            href="/arpg-game/"
            className="inline-block px-12 py-5 font-serif text-base md:text-lg tracking-[0.3em] text-black uppercase bg-secondary hover:bg-foreground transition-colors duration-500 shadow-[0_0_60px_rgba(200,150,50,0.4)]"
          >
            Bind a Grudge
          </a>
          <p className="mt-8 text-xs text-muted-foreground/70 font-serif tracking-widest uppercase">
            Free to play · No install · Loads in your browser
          </p>
        </FadeIn>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="relative py-12 border-t border-border/30">
      <div className="max-w-7xl mx-auto px-6 md:px-12 flex flex-col md:flex-row items-center justify-between gap-4 text-xs tracking-widest uppercase font-serif text-muted-foreground/60">
        <div>Grudges · An action-RPG of the surface tribes</div>
        <div className="text-secondary/70">
          Year 2398 OEY · 343 Post-Contact
        </div>
      </div>
    </footer>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Root
// ─────────────────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <div className="bg-background text-foreground min-h-screen overflow-x-hidden">
      <TopNav />
      <Hero />
      <ColdOpen />
      <ThreePaths />
      <PillarsSection />
      <BestiarySection />
      <BuildSection />
      <VoicesSection />
      <FinalCTA />
      <Footer />
    </div>
  );
}
