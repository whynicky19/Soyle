"use client";

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
const games = [
  {
    title: "Первые слова",
    text: "Знакомимся с миром через звуки, слова и яркие картинки.",
    image: "game-first-words",
    tag: "СЛУШАЕМ И УЗНАЁМ",
    tone: "peach",
    alt: "Птичка Söyle рядом с планшетом с картинкой собаки",
  },
  {
    title: "Собираем фразы",
    text: "Учимся соединять слова и выражать свои мысли.",
    image: "game-sentences",
    tag: "СОЕДИНЯЕМ СЛОВА",
    tone: "sky",
    alt: "Солнце и карточки для фразы на игровом планшете",
  },
  {
    title: "Интерактивные истории",
    text: "Развиваем общение через увлекательные игровые истории.",
    image: "game-stories",
    tag: "ИГРАЕМ ВМЕСТЕ",
    tone: "sage",
    alt: "Сказочная история с мальчиком и медвежонком на планшете",
  },
];
const forms = [
  {
    title: "Сенсорная алалия",
    text: "Ребёнку трудно понимать обращённую речь.",
    image: "alalia-sensory",
    tone: "rose",
    icon: Volume2,
  },
  {
    title: "Моторная алалия",
    text: "Ребёнку трудно формировать и произносить слова, даже когда понимание речи относительно сохранно.",
    image: "alalia-motor",
    tone: "sky",
    icon: MessageCircle,
  },
  {
    title: "Смешанная форма",
    text: "Трудности затрагивают и понимание речи, и её самостоятельное формирование.",
    image: "alalia-mixed",
    tone: "sage",
    icon: Puzzle,
  },
];
const benefits = [
  [
    "benefit-play",
    "Игровой подход",
    "Знакомые сюжеты и маленькие открытия помогают вовлечь ребёнка в занятие.",
  ],
  [
    "benefit-personalization",
    "В своём темпе",
    "Короткая практика с учётом предпочтений. Всегда можно сделать паузу.",
  ],
  [
    "benefit-progress",
    "Понятно родителям",
    "История заданий и ваши наблюдения помогают замечать маленькие шаги.",
  ],
  [
    "benefit-family",
    "Удобно заниматься дома",
    "Выбирайте 3, 5 или 10 минут практики и занимайтесь рядом с ребёнком.",
  ],
];
const questions = [
  [
    "С чего начать?",
    "Откройте Söyle, создайте аккаунт родителя и профиль ребёнка. Выберите направление и удобную длительность практики: 3, 5 или 10 минут. Начните рядом с ребёнком, без спешки.",
  ],
  [
    "Söyle заменяет логопеда?",
    "Нет. Söyle помогает организовать игровые занятия и домашнюю практику. Платформа не ставит диагноз и не заменяет диагностику и работу с квалифицированными специалистами.",
  ],
  [
    "Нужна ли камера?",
    "Для большинства занятий камера не нужна. Для отдельных упражнений она включается с отдельного согласия. Обработка происходит в браузере, кадры не отправляются на сервер.",
  ],
  [
    "Что я увижу в кабинете родителя?",
    "Историю занятий, результаты упражнений, цели и план домашней практики. Вы также можете сохранять собственные наблюдения. Игровые результаты не являются оценкой речевого развития.",
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
  children = "Попробовать Söyle",
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
  const close = () => setMenuOpen(false);
  const speak = () => {
    if (!audio.current) return;
    if (speaking) {
      audio.current.pause();
      setSpeaking(false);
      return;
    }
    audio.current.src = `/audio/landing/${selected}.wav`;
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
        Перейти к содержанию
      </a>
      <header className="sl-header">
        <div className="sl-container sl-nav">
          <Link href="/" aria-label="Söyle — главная">
            <Logo />
          </Link>
          <nav
            id="sl-navigation"
            className={menuOpen ? "sl-open" : ""}
            aria-label="Основная навигация"
          >
            <a href="#about" onClick={close}>
              О продукте
            </a>
            <a href="#family" onClick={close}>
              Для кого
            </a>
            <a href="#journey" onClick={close}>
              Как это работает
            </a>
            <a href="#benefits" onClick={close}>
              Преимущества
            </a>
            <a href="#questions" onClick={close}>
              Вопросы
            </a>
            <Link className="sl-mobile-login" href="/app">
              Войти в Söyle <ArrowRight size={16} />
            </Link>
          </nav>
          <div className="sl-nav-actions">
            <Link href="/app" className="sl-login">
              Войти
            </Link>
            <Action />
          </div>
          <button
            type="button"
            className="sl-menu"
            aria-label={menuOpen ? "Закрыть меню" : "Открыть меню"}
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
              alt="Мальчик и птичка Söyle вместе играют с планшетом в уютной солнечной комнате"
              sizes="100vw"
            />
          </div>
          <div className="sl-container sl-hero-inner">
            <div className="sl-hero-copy">
              <span className="sl-eyebrow">
                <Star size={13} fill="currentColor" /> Развитие речи через игру
              </span>
              <h1>
                <span>Каждое слово —</span>
                <span>маленькое открытие.</span>
              </h1>
              <p>
                Игровые занятия, которые помогают детям развивать речь,
                понимание и общение в естественной и радостной форме.
              </p>
              <div className="sl-actions">
                <Action />
                <Action secondary href="#games">
                  Узнать больше
                </Action>
              </div>
              <div className="sl-trust">
                <div>
                  <span className="sl-icon rose">
                    <Heart fill="currentColor" />
                  </span>
                  Короткие занятия
                  <br />в своём темпе
                </div>
                <div>
                  <span className="sl-icon sky">
                    <MessageCircle fill="currentColor" />
                  </span>
                  Для ребёнка
                  <br />и родителей
                </div>
                <div>
                  <span className="sl-icon yellow">
                    <ShieldCheck />
                  </span>
                  Без рекламы
                  <br />и лишнего шума
                </div>
              </div>
            </div>
            <div className="sl-speech-bubble" aria-hidden="true">
              Новые слова!
              <br />
              Новые открытия!
              <Sparkles size={20} />
            </div>
          </div>
          <OrganicWave />
        </section>

        <section className="sl-games sl-container" id="games">
          <div className="sl-section-heading" data-reveal>
            <div>
              <h2>
                Игры, которые говорят сами за себя{" "}
                <span className="sl-heading-spark" aria-hidden="true">
                  ✦
                </span>
              </h2>
              <p>
                Разнообразные интерактивные занятия
                <br className="sl-desktop-break" /> для развития речи и
                коммуникации.
              </p>
            </div>
            <Action secondary href="/app">
              Посмотреть занятия
            </Action>
          </div>
          <div className="sl-game-grid">
            {games.map((game, i) => (
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
                  alt="Задумчивый мальчик за столом"
                  sizes="(max-width: 650px) 42vw, 20vw"
                />
                <span aria-hidden="true">?</span>
              </div>
              <div className="sl-alalia-copy">
                <h2>Что такое алалия?</h2>
                <p>
                  Алалия — выраженное нарушение развития речи, связанное с
                  трудностями формирования речевых функций.
                </p>
                <p>
                  Проявления у детей могут различаться, поэтому занятия должны
                  учитывать индивидуальные особенности ребёнка.
                </p>
                <a
                  className="sl-button sl-secondary"
                  href="#alalia-details"
                  onClick={() => {
                    const details = document.getElementById("alalia-details");
                    if (details instanceof HTMLDetailsElement)
                      details.open = true;
                  }}
                >
                  Узнать больше об алалии <ArrowRight size={16} />
                </a>
              </div>
            </div>
            <div className="sl-form-grid">
              {forms.map((form, i) => (
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
                Каждому ребёнку — своя поддержка <ChevronDown size={16} />
              </summary>
              <p>
                Эти описания упрощены для родителей и не подходят для
                самостоятельной диагностики. При вопросах о развитии речи
                обратитесь к квалифицированному специалисту.
              </p>
            </details>
            <p>
              Söyle помогает организовать игровые занятия и домашнюю практику.
              Платформа не заменяет диагностику и работу со специалистами.
            </p>
          </div>
          <OrganicWave alternate />
        </section>

        <section className="sl-family sl-container" id="family">
          <article className="sl-child-panel" data-reveal>
            <Illustration
              name="child-experience"
              alt="Мальчик занимается с планшетом рядом с птичкой Söyle"
              sizes="(max-width: 800px) 100vw, 50vw"
            />
            <div className="sl-child-copy">
              <span className="sl-tag sl-peach-tag">Для ребёнка</span>
              <h2>
                Играй. Исследуй.
                <br />
                Говори!
              </h2>
              <p>
                Любимые герои и знакомые сюжеты превращают занятия в маленькое
                приключение.
              </p>
              <ul>
                {[
                  "Интерактивные занятия",
                  "Знакомые игровые сценарии",
                  "Поддержка общения",
                  "Комфортный темп",
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
              <span className="sl-tag">Для родителей</span>
              <h2>
                Наблюдайте
                <br />
                за прогрессом
              </h2>
              <p>
                Замечайте маленькие шаги и поддерживайте ребёнка в повседневной
                жизни.
              </p>
              <ul>
                <li>
                  <History />
                  История занятий
                </li>
                <li>
                  <Target />
                  Результаты упражнений
                </li>
                <li>
                  <BookOpen />
                  План домашней практики
                </li>
                <li>
                  <Heart />
                  Наблюдения родителей
                </li>
              </ul>
            </div>
            <div className="sl-parent-preview">
              <div className="sl-preview-head">
                <Logo />
                <span>Кабинет родителя</span>
              </div>
              <strong>
                Каждый маленький
                <br />
                шаг важен
              </strong>
              <div className="sl-preview-stats">
                <div>
                  <b>—</b>
                  <span>занятий за неделю</span>
                </div>
                <div>
                  <b>—</b>
                  <span>заданий с попытками</span>
                </div>
              </div>
              <div className="sl-preview-row">
                <History size={18} />
                <div>
                  <b>История практики</b>
                  <small>Здесь появятся ваши занятия</small>
                </div>
              </div>
              <div className="sl-preview-row">
                <BookOpen size={18} />
                <div>
                  <b>Цели и план</b>
                  <small>Практика в удобном темпе</small>
                </div>
              </div>
              <Link href="/app">
                Открыть кабинет <ArrowRight size={14} />
              </Link>
              <small className="sl-preview-caption">
                Пример кабинета до начала занятий
              </small>
            </div>
          </article>
        </section>

        <section className="sl-journey" id="journey">
          <OrganicWave edge="top" />
          <div className="sl-journey-art">
            <Illustration
              name="speech-journey"
              mobileName="speech-journey-mobile"
              alt="Сказочная долина с тропинкой, речкой, мостом и маленьким замком вдали"
              sizes="100vw"
            />
          </div>
          <div className="sl-container sl-journey-content">
            <h2 data-reveal>
              Путь к большим разговорам
              <br />с маленьких шагов
            </h2>
            <ol>
              {[
                "Знакомимся со звуками",
                "Учим первые слова",
                "Собираем фразы",
                "Общаемся в разных ситуациях",
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
            <p>Возможные направления занятий. У каждого ребёнка свой путь.</p>
          </div>
          <OrganicWave alternate />
        </section>

        <section className="sl-benefits sl-container" id="benefits">
          <Foliage kind="tall" className="sl-benefits-leaves-left" />
          <Foliage kind="garden" className="sl-benefits-leaves-right" />
          <div data-reveal>
            <h2>
              Почему выбирают Söyle{" "}
              <span className="sl-heading-spark" aria-hidden="true">
                ✦
              </span>
            </h2>
            <p>
              Игровой формат, понятные шаги и забота —<br />
              чтобы открывать мир общения вместе.
            </p>
          </div>
          <div className="sl-benefit-grid">
            {benefits.map(([name, title, text], i) => (
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
            <span className="sl-tag">Маленькое знакомство</span>
            <h2>
              Иногда одна карточка
              <br />
              говорит о многом.
            </h2>
            <p>
              Попробуйте выбрать, что хочется сказать.
              <br />
              Так работают визуальные карточки общения.
            </p>
          </div>
          <div className="sl-aac">
            <span className="sl-aac-label">
              Экран «Сказать» <span>Демо</span>
            </span>
            <p aria-live="polite">
              Я хочу{" "}
              <strong>
                {selected === "water"
                  ? "воду"
                  : selected === "apple"
                    ? "яблоко"
                    : "играть"}
              </strong>
            </p>
            <div className="sl-aac-options">
              {[
                { id: "water", label: "Воду", path: "food/water" },
                { id: "apple", label: "Яблоко", path: "food/apple" },
                { id: "play", label: "Играть", path: "toys/ball" },
              ].map((item) => (
                <button
                  key={item.id}
                  aria-pressed={selected === item.id}
                  onClick={() => {
                    audio.current?.pause();
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
              {speaking ? "Остановить" : "Произнести"}
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
              <small role="status">Звук недоступен. Попробуйте ещё раз.</small>
            )}
          </div>
        </section>

        <section className="sl-faq sl-container" id="questions">
          <div data-reveal>
            <span className="sl-tag">Родителям на заметку</span>
            <h2>
              О важном —<br />
              простыми словами.
            </h2>
            <p>Вопросы перед первым занятием.</p>
          </div>
          <div className="sl-faq-list">
            {questions.map(([q, a]) => (
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
              alt="В уютной вечерней комнате мальчик и птичка Söyle вместе читают книгу под тёплой гирляндой"
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
                Давайте вместе
                <br />
                <em>открывать мир слов</em>
              </h2>
              <p>
                Познакомьтесь с Söyle и откройте для ребёнка мир игровых
                занятий, маленьких открытий и новых возможностей общения.
              </p>
              <div className="sl-actions">
                <Action />
                <Action secondary href="#games">
                  Узнать больше
                </Action>
              </div>
            </div>
          </div>
          <OrganicWave />
        </section>
      </main>
      <footer className="sl-footer">
        <div className="sl-container sl-footer-grid">
          <div>
            <Link href="/" aria-label="Söyle — главная">
              <Logo />
            </Link>
            <p>Развиваем речь. Открываем мир.</p>
          </div>
          <div>
            <b>Продукт</b>
            <a href="#games">Занятия</a>
            <a href="#family">Для семьи</a>
            <a href="#journey">Как это работает</a>
          </div>
          <div>
            <b>Полезное</b>
            <a href="#alalia">Об алалии</a>
            <a href="#questions">Вопросы и ответы</a>
            <Link href="/app">Кабинет родителя</Link>
          </div>
          <div>
            <b>Документы</b>
            <Link href="/privacy">Конфиденциальность</Link>
            <Link href="/terms">Пользовательское соглашение</Link>
            <a href="mailto:hello@soyle.app">hello@soyle.app</a>
          </div>
        </div>
        <div className="sl-container sl-footer-bottom">
          <span>© 2026 Söyle</span>
          <p>
            Домашняя практика и поддержка общения. Не заменяет консультацию
            специалиста.
          </p>
          <span>Русский</span>
        </div>
      </footer>
    </div>
  );
}
