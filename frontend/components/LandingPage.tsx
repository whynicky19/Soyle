"use client";
import { API_URL } from "@/lib/api";
import { t, useLocale } from "@/lib/i18n";
import { LanguagePicker } from "./LanguagePicker";

import Image from "next/image";
import { BrandLogo } from "@/components/BrandLogo";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  Heart,
  History,
  Menu,
  MessageCircle,
  Puzzle,
  ShieldCheck,
  Sparkles,
  Star,
  Target,
  Volume2,
  X,
} from "lucide-react";
import "@/app/landing.css";

const art = "/images/landing/";
const games = () => [
  {
    title: t("landing.copy000"),
    text: t("landing.copy001"),
    image: "game-first-words",
    tag: t("landing.copy002"),
    tone: "peach",
    alt: t("landing.copy003"),
  },
  {
    title: t("landing.copy004"),
    text: t("landing.copy005"),
    image: "game-sentences",
    tag: t("landing.copy006"),
    tone: "sky",
    alt: t("landing.copy007"),
  },
  {
    title: t("landing.copy008"),
    text: t("landing.copy009"),
    image: "game-stories",
    tag: t("landing.copy010"),
    tone: "sage",
    alt: t("landing.copy011"),
  },
];
const forms = () => [
  {
    title: t("landing.copy012"),
    text: t("landing.copy013"),
    image: "alalia-sensory",
    tone: "rose",
    icon: Volume2,
  },
  {
    title: t("landing.copy014"),
    text: t("landing.copy015"),
    image: "alalia-motor",
    tone: "sky",
    icon: MessageCircle,
  },
  {
    title: t("landing.copy016"),
    text: t("landing.copy017"),
    image: "alalia-mixed",
    tone: "sage",
    icon: Puzzle,
  },
];
const benefits = () => [
  [
    "benefit-play",
    t("landing.copy018"),
    t("landing.copy019"),
  ],
  [
    "benefit-personalization",
    t("landing.copy020"),
    t("landing.copy021"),
  ],
  [
    "benefit-progress",
    t("landing.copy022"),
    t("landing.copy023"),
  ],
  [
    "benefit-family",
    t("landing.copy024"),
    t("landing.copy025"),
  ],
];
const questions = () => [
  [
    t("landing.copy026"),
    t("landing.copy027"),
  ],
  [
    t("landing.copy028"),
    t("landing.copy029"),
  ],
  [
    t("landing.copy030"),
    t("landing.copy031"),
  ],
  [
    t("landing.copy032"),
    t("landing.copy033"),
  ],
];

function Illustration({
  name,
  alt = "",
  className = "",
  priority = false,
  mobileName,
  sizes = "(max-width: 760px) 100vw, 40vw",
}: {
  name: string;
  alt?: string;
  className?: string;
  priority?: boolean;
  mobileName?: string;
  sizes?: string;
}) {
  const image = (
    <Image
      className={className}
      src={`${art}${name}.webp`}
      alt={alt}
      fill
      quality={75}
      sizes={sizes}
      {...(priority ? { preload: true } : { loading: "lazy" as const })}
    />
  );
  return mobileName ? (
    <picture>
      <source media="(max-width: 650px)" srcSet={`${art}${mobileName}.webp`} />
      {image}
    </picture>
  ) : (
    image
  );
}
function Logo() {
  return (
    <BrandLogo
      variant="primary"
      width={190}
      responsive
      className="sl-brand-logo"
    />
  );
}

function Foliage({
  kind,
  className,
}: {
  kind: "tall" | "canopy" | "garden";
  className: string;
}) {
  return (
    <div
      className={`sl-foliage sl-foliage-${kind} ${className}`}
      aria-hidden="true"
    >
      <Image
        src={`${art}foliage-${kind}.webp`}
        alt=""
        fill
        sizes="(max-width: 650px) 80px, 190px"
        loading="lazy"
      />
    </div>
  );
}

function OrganicWave({
  edge = "bottom",
  alternate = false,
}: {
  edge?: "top" | "bottom";
  alternate?: boolean;
}) {
  return (
    <svg
      className={`sl-wave sl-wave-${edge}`}
      viewBox="0 0 1440 64"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d={
          alternate
            ? "M0 23C145 4 260 57 440 35S690 2 856 30S1130 63 1440 13V64H0Z"
            : "M0 30C170 60 310 3 487 25S755 57 937 28S1210 4 1440 32V64H0Z"
        }
        fill="currentColor"
      />
    </svg>
  );
}
function Action({
  secondary = false,
  href = "/app",
  children = t("landing.copy034"),
}: {
  secondary?: boolean;
  href?: string;
  children?: React.ReactNode;
}) {
  return (
    <Link
      className={`sl-button ${secondary ? "sl-secondary" : "sl-primary"}`}
      href={href}
    >
      {children}
      <ArrowRight size={18} aria-hidden="true" />
    </Link>
  );
}

export function LandingPage() {
  const locale = useLocale();
  const [menuOpen, setMenuOpen] = useState(false);
  const [selected, setSelected] = useState("water");
  const [speaking, setSpeaking] = useState(false);
  const [audioError, setAudioError] = useState(false);
  const audio = useRef<HTMLAudioElement>(null);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => element.classList.toggle("sl-motion", !media.matches);
    sync();
    media.addEventListener("change", sync);
    const observer = new IntersectionObserver(
      (entries) =>
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("sl-visible");
            observer.unobserve(entry.target);
          }
        }),
      { threshold: 0.08 },
    );
    element
      .querySelectorAll("[data-reveal]")
      .forEach((item) => observer.observe(item));
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", escape);
    return () => {
      observer.disconnect();
      media.removeEventListener("change", sync);
      window.removeEventListener("keydown", escape);
    };
  }, []);
  useEffect(() => {
    const player = audio.current;
    const stop = () => { player?.pause(); window.speechSynthesis?.cancel(); setSpeaking(false); };
    window.addEventListener("soyle-locale-changing", stop);
    return () => { window.removeEventListener("soyle-locale-changing", stop); player?.pause(); window.speechSynthesis?.cancel(); };
  }, []);
  const close = () => setMenuOpen(false);
  const speak = () => {
    if (!audio.current) return;
    if (speaking) {
      audio.current.pause();
      window.speechSynthesis?.cancel();
      setSpeaking(false);
      return;
    }
    audio.current.src = `${API_URL}/api/public/speech/${locale === "kk-KZ" ? "kk" : "ru"}/${selected}`;
    setAudioError(false);
    setSpeaking(true);
    void audio.current.play().catch(() => {
      setSpeaking(false);
      setAudioError(true);
    });
  };

  return (
    <div className="sl-page" ref={root}>
      <a className="sl-skip" href="#main-content">
        {t("landing.copy035")}</a>
      <header className="sl-header">
        <div className="sl-container sl-nav">
          <Link href="/" aria-label={t("landing.copy036")}>
            <Logo />
          </Link>
          <nav
            id="sl-navigation"
            className={menuOpen ? "sl-open" : ""}
            aria-label={t("landing.copy037")}
          >
            <a href="#about" onClick={close}>
              {t("landing.copy038")}</a>
            <a href="#family" onClick={close}>
              {t("landing.copy039")}</a>
            <a href="#journey" onClick={close}>
              {t("landing.copy040")}</a>
            <a href="#benefits" onClick={close}>
              {t("landing.copy041")}</a>
            <a href="#questions" onClick={close}>
              {t("landing.copy042")}</a>
            <Link className="sl-mobile-login" href="/app">
              {t("landing.copy043")}<ArrowRight size={16} />
            </Link>
          </nav>
          <div className="sl-nav-actions"><LanguagePicker compact/>
            <Link href="/app" className="sl-login">
              {t("landing.copy044")}</Link>
            <Action />
          </div>
          <button
            type="button"
            className="sl-menu"
            aria-label={menuOpen ? t("landing.copy045") : t("landing.copy046")}
            aria-expanded={menuOpen}
            aria-controls="sl-navigation"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            {menuOpen ? <X /> : <Menu />}
          </button>
        </div>
      </header>
      <main id="main-content">
        <section className="sl-hero" id="about">
          <Foliage kind="tall" className="sl-hero-leaves-left" />
          <Foliage kind="canopy" className="sl-hero-leaves-right" />
          <div className="sl-hero-art">
            <Illustration
              name="hero-room"
              priority
              alt={t("landing.copy047")}
              sizes="100vw"
            />
          </div>
          <div className="sl-container sl-hero-inner">
            <div className="sl-hero-copy">
              <span className="sl-eyebrow">
                <Star size={13} fill="currentColor" /> {t("landing.copy048")}</span>
              <h1>
                <span>{t("landing.copy049")}</span>
                <span>{t("landing.copy050")}</span>
              </h1>
              <p>
                {t("landing.copy051")}</p>
              <div className="sl-actions">
                <Action />
                <Action secondary href="#games">
                  {t("landing.copy052")}</Action>
              </div>
              <div className="sl-trust">
                <div>
                  <span className="sl-icon rose">
                    <Heart fill="currentColor" />
                  </span>
                  {t("landing.copy053")}<br />{t("landing.copy054")}</div>
                <div>
                  <span className="sl-icon sky">
                    <MessageCircle fill="currentColor" />
                  </span>
                  {t("landing.copy055")}<br />{t("landing.copy056")}</div>
                <div>
                  <span className="sl-icon yellow">
                    <ShieldCheck />
                  </span>
                  {t("landing.copy057")}<br />{t("landing.copy058")}</div>
              </div>
            </div>
            <div className="sl-speech-bubble" aria-hidden="true">
              {t("landing.copy059")}<br />
              {t("landing.copy060")}<Sparkles size={20} />
            </div>
          </div>
          <OrganicWave />
        </section>

        <section className="sl-games sl-container" id="games">
          <div className="sl-section-heading" data-reveal>
            <div>
              <h2>
                {t("landing.copy061")}{" "}
                <span className="sl-heading-spark" aria-hidden="true">
                  ✦
                </span>
              </h2>
              <p>
                {t("landing.copy062")}<br className="sl-desktop-break" /> {t("landing.copy063")}</p>
            </div>
            <Action secondary href="/app">
              {t("landing.copy064")}</Action>
          </div>
          <div className="sl-game-grid">
            {games().map((game, i) => (
              <Link
                className={`sl-game ${game.tone}`}
                href="/app"
                key={game.title}
                data-reveal
                style={{ "--delay": `${i * 85}ms` } as React.CSSProperties}
              >
                <div className="sl-game-copy">
                  <span className="sl-game-number">0{i + 1}</span>
                  <h3>{game.title}</h3>
                  <p>{game.text}</p>
                </div>
                <div className="sl-game-image">
                  <Illustration
                    name={game.image}
                    alt={game.alt}
                    sizes="(max-width: 650px) 100vw, 33vw"
                  />
                </div>
                <div className="sl-game-bottom">
                  <span>{game.tag}</span>
                  <ArrowRight size={18} />
                </div>
              </Link>
            ))}
          </div>
        </section>

        <section className="sl-alalia" id="alalia">
          <OrganicWave edge="top" alternate />
          <Foliage kind="tall" className="sl-alalia-leaves" />
          <div className="sl-container sl-alalia-grid">
            <div className="sl-alalia-intro" data-reveal>
              <div className="sl-thoughtful">
                <Illustration
                  name="alalia-intro"
                  alt={t("landing.copy065")}
                  sizes="(max-width: 650px) 42vw, 20vw"
                />
                <span aria-hidden="true">?</span>
              </div>
              <div className="sl-alalia-copy">
                <h2>{t("landing.copy066")}</h2>
                <p>
                  {t("landing.copy067")}</p>
                <p>
                  {t("landing.copy068")}</p>
                <a
                  className="sl-button sl-secondary"
                  href="#alalia-details"
                  onClick={() => {
                    const details = document.getElementById("alalia-details");
                    if (details instanceof HTMLDetailsElement)
                      details.open = true;
                  }}
                >
                  {t("landing.copy069")}<ArrowRight size={16} />
                </a>
              </div>
            </div>
            <div className="sl-form-grid">
              {forms().map((form, i) => (
                <article
                  className={`sl-form ${form.tone}`}
                  key={form.title}
                  data-reveal
                  style={{ "--delay": `${i * 80}ms` } as React.CSSProperties}
                >
                  <h3>
                    <form.icon size={19} />
                    {form.title}
                  </h3>
                  <div className="sl-form-image">
                    <Illustration
                      name={form.image}
                      sizes="(max-width: 650px) 32vw, 16vw"
                    />
                  </div>
                  <p>{form.text}</p>
                </article>
              ))}
            </div>
          </div>
          <div className="sl-container sl-alalia-note">
            <details id="alalia-details">
              <summary>
                {t("landing.copy070")}<ChevronDown size={16} />
              </summary>
              <p>
                {t("landing.copy071")}</p>
            </details>
            <p>
              {t("landing.copy072")}</p>
          </div>
          <OrganicWave alternate />
        </section>

        <section className="sl-family sl-container" id="family">
          <article className="sl-child-panel" data-reveal>
            <Illustration
              name="child-experience"
              alt={t("landing.copy073")}
              sizes="(max-width: 800px) 100vw, 50vw"
            />
            <div className="sl-child-copy">
              <span className="sl-tag sl-peach-tag">{t("landing.copy055")}</span>
              <h2>
                {t("landing.copy074")}<br />
                {t("landing.copy075")}</h2>
              <p>
                {t("landing.copy076")}</p>
              <ul>
                {[
                  t("landing.copy077"),
                  t("landing.copy078"),
                  t("landing.copy079"),
                  t("landing.copy080"),
                ].map((text) => (
                  <li key={text}>
                    <Check size={15} />
                    {text}
                  </li>
                ))}
              </ul>
            </div>
          </article>
          <article className="sl-parent-panel" data-reveal>
            <div className="sl-parent-copy">
              <span className="sl-tag">{t("landing.copy081")}</span>
              <h2>
                {t("landing.copy082")}<br />
                {t("landing.copy083")}</h2>
              <p>
                {t("landing.copy084")}</p>
              <ul>
                <li>
                  <History />
                  {t("landing.copy085")}</li>
                <li>
                  <Target />
                  {t("landing.copy086")}</li>
                <li>
                  <BookOpen />
                  {t("landing.copy087")}</li>
                <li>
                  <Heart />
                  {t("landing.copy088")}</li>
              </ul>
            </div>
            <div className="sl-parent-preview">
              <div className="sl-preview-head">
                <Logo />
                <span>{t("landing.copy089")}</span>
              </div>
              <strong>
                {t("landing.copy090")}<br />
                {t("landing.copy091")}</strong>
              <div className="sl-preview-stats">
                <div>
                  <b>—</b>
                  <span>{t("landing.copy092")}</span>
                </div>
                <div>
                  <b>—</b>
                  <span>{t("landing.copy093")}</span>
                </div>
              </div>
              <div className="sl-preview-row">
                <History size={18} />
                <div>
                  <b>{t("landing.copy094")}</b>
                  <small>{t("landing.copy095")}</small>
                </div>
              </div>
              <div className="sl-preview-row">
                <BookOpen size={18} />
                <div>
                  <b>{t("landing.copy096")}</b>
                  <small>{t("landing.copy097")}</small>
                </div>
              </div>
              <Link href="/app">
                {t("landing.copy098")}<ArrowRight size={14} />
              </Link>
              <small className="sl-preview-caption">
                {t("landing.copy099")}</small>
            </div>
          </article>
        </section>

        <section className="sl-journey" id="journey">
          <OrganicWave edge="top" />
          <div className="sl-journey-art">
            <Illustration
              name="speech-journey"
              mobileName="speech-journey-mobile"
              alt={t("landing.copy100")}
              sizes="100vw"
            />
          </div>
          <div className="sl-container sl-journey-content">
            <h2 data-reveal>
              {t("landing.copy101")}<br />{t("landing.copy102")}</h2>
            <ol>
              {[
                t("landing.copy103"),
                t("landing.copy104"),
                t("landing.copy004"),
                t("landing.copy105"),
              ].map((step, i) => (
                <li
                  data-reveal
                  key={step}
                  style={{ "--delay": `${i * 100}ms` } as React.CSSProperties}
                >
                  <span>0{i + 1}</span>
                  {step}
                </li>
              ))}
            </ol>
            <p>{t("landing.copy106")}</p>
          </div>
          <OrganicWave alternate />
        </section>

        <section className="sl-benefits sl-container" id="benefits">
          <Foliage kind="tall" className="sl-benefits-leaves-left" />
          <Foliage kind="garden" className="sl-benefits-leaves-right" />
          <div data-reveal>
            <h2>
              {t("landing.copy107")}{" "}
              <span className="sl-heading-spark" aria-hidden="true">
                ✦
              </span>
            </h2>
            <p>
              {t("landing.copy108")}<br />
              {t("landing.copy109")}</p>
          </div>
          <div className="sl-benefit-grid">
            {benefits().map(([name, title, text], i) => (
              <article
                key={name}
                data-reveal
                style={{ "--delay": `${i * 80}ms` } as React.CSSProperties}
              >
                <div className="sl-benefit-art">
                  <Illustration name={name} sizes="110px" />
                </div>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="sl-try sl-container" id="try" data-reveal>
          <div>
            <span className="sl-tag">{t("landing.copy110")}</span>
            <h2>
              {t("landing.copy111")}<br />
              {t("landing.copy112")}</h2>
            <p>
              {t("landing.copy113")}<br />
              {t("landing.copy114")}</p>
          </div>
          <div className="sl-aac">
            <span className="sl-aac-label">
              {t("landing.copy115")}<span>{t("landing.copy116")}</span>
            </span>
            <p aria-live="polite">
              {locale === "kk-KZ" ? "" : t("landing.copy117")}{" "}
              <strong>
                {locale === "kk-KZ" ? (selected === "water" ? t("landing.aac.water") : selected === "apple" ? t("landing.aac.apple") : t("landing.aac.play")) : selected === "water"
                  ? t("landing.copy118")
                  : selected === "apple"
                    ? t("landing.copy119")
                    : t("landing.copy120")}
              </strong>
            </p>
            <div className="sl-aac-options">
              {[
                { id: "water", label: t("landing.copy121"), path: "food/water" },
                { id: "apple", label: t("landing.copy122"), path: "food/apple" },
                { id: "play", label: t("landing.copy123"), path: "toys/ball" },
              ].map((item) => (
                <button
                  key={item.id}
                  aria-pressed={selected === item.id}
                  onClick={() => {
                    audio.current?.pause();
                    window.speechSynthesis?.cancel();
                    setSelected(item.id);
                    setSpeaking(false);
                    setAudioError(false);
                  }}
                >
                  <Image
                    src={`/p15/nouns/${item.path}.svg`}
                    width={48}
                    height={48}
                    alt=""
                  />
                  {item.label}
                  {selected === item.id && <Check size={13} />}
                </button>
              ))}
            </div>
            <button className="sl-button sl-primary" onClick={speak}>
              <Volume2 size={18} />
              {speaking ? t("landing.copy124") : t("landing.copy125")}
            </button>
            <audio
              ref={audio}
              preload="none"
              onEnded={() => setSpeaking(false)}
              onError={() => {
                setSpeaking(false);
                setAudioError(true);
              }}
            />
            {audioError && (
              <small role="status">{t("landing.copy126")}</small>
            )}
          </div>
        </section>

        <section className="sl-faq sl-container" id="questions">
          <div data-reveal>
            <span className="sl-tag">{t("landing.copy127")}</span>
            <h2>
              {t("landing.copy128")}<br />
              {t("landing.copy129")}</h2>
            <p>{t("landing.copy130")}</p>
          </div>
          <div className="sl-faq-list">
            {questions().map(([q, a]) => (
              <details key={q} data-reveal>
                <summary>
                  {q}
                  <ChevronDown size={18} />
                </summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="sl-night">
          <OrganicWave edge="top" alternate />
          <Foliage kind="tall" className="sl-night-leaves" />
          <div className="sl-night-art">
            <Illustration
              name="final-night-scene"
              alt={t("landing.copy131")}
              sizes="100vw"
            />
          </div>
          <span className="sl-night-star sl-star-one" aria-hidden="true">
            ✦
          </span>
          <span className="sl-night-star sl-star-two" aria-hidden="true">
            ✦
          </span>
          <div className="sl-container sl-night-inner">
            <div data-reveal>
              <h2>
                {t("landing.copy132")}<br />
                <em>{t("landing.copy133")}</em>
              </h2>
              <p>
                {t("landing.copy134")}</p>
              <div className="sl-actions">
                <Action />
                <Action secondary href="#games">
                  {t("landing.copy052")}</Action>
              </div>
            </div>
          </div>
          <OrganicWave />
        </section>
      </main>
      <footer className="sl-footer">
        <div className="sl-container sl-footer-grid">
          <div>
            <Link href="/" aria-label={t("landing.copy036")}>
              <Logo />
            </Link>
            <p>{t("landing.copy135")}</p>
          </div>
          <div>
            <b>{t("landing.copy136")}</b>
            <a href="#games">{t("landing.copy137")}</a>
            <a href="#family">{t("landing.copy138")}</a>
            <a href="#journey">{t("landing.copy040")}</a>
          </div>
          <div>
            <b>{t("landing.copy139")}</b>
            <a href="#alalia">{t("landing.copy140")}</a>
            <a href="#questions">{t("landing.copy141")}</a>
            <Link href="/app">{t("landing.copy089")}</Link>
          </div>
          <div>
            <b>{t("landing.copy142")}</b>
            <Link href="/privacy">{t("landing.copy143")}</Link>
            <Link href="/terms">{t("landing.copy144")}</Link>
            <a href="mailto:hello@soyle.app">hello@soyle.app</a>
          </div>
        </div>
        <div className="sl-container sl-footer-bottom">
          <span>© 2026 Söyle</span>
          <p>
            {t("landing.copy145")}</p>
          <LanguagePicker/>
        </div>
      </footer>
    </div>
  );
}
