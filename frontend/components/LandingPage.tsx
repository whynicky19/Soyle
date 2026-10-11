"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  ChevronDown,
  Menu,
  X,
} from "lucide-react";
import "@/app/landing.css";

const features = [
  {
    label: "Понимание речи",
    title: "Слышать задачу - без спешки и перегрузки",
    text: "Ребёнок получает один понятный шаг, слушает короткую инструкцию и выбирает ответ в своём темпе.",
    points: ["Без таймера и штрафов", "Повтор инструкции в любой момент"],
    image: "/landing/listening-v3.webp",
    alt: "Ребёнок в наушниках спокойно выбирает визуальную карточку рядом с планшетом",
  },
  {
    label: "AAC-коммуникация",
    title: "Важное можно сказать не только словами",
    text: "Визуальные карточки помогают попросить, отказаться, сообщить о самочувствии и составить короткую фразу.",
    points: ["Доступно до, во время и после занятия", "Выбор ребёнка не оценивается"],
    image: "/landing/aac-v3.webp",
    alt: "Вид сверху: ребёнок самостоятельно собирает фразу из визуальных карточек",
  },
  {
    label: "Кабинет родителя",
    title: "Вместо потока данных - ясный следующий шаг",
    text: "История практики, настройки приватности и спокойные рекомендации собраны отдельно от детского режима.",
    points: ["Прогресс без диагностических выводов", "AI включается только с согласия"],
    image: "/landing/parent-guidance-v3.webp",
    alt: "Родитель вечером просматривает спокойную сводку занятия на планшете",
  },
];

const steps = [
  ["01", "Создайте профиль", "Укажите только то, что помогает настроить удобную практику."],
  ["02", "Выберите 3, 5 или 10 минут", "Короткий формат легче встроить в реальный семейный день."],
  ["03", "Начните с одного действия", "Söyle ведёт по шагам, а остановиться можно в любой момент."],
];

const faqs = [
  ["Söyle заменяет логопеда?", "Нет. Платформа помогает организовать домашнюю практику, но не ставит диагноз и не заменяет врача или логопеда."],
  ["Можно пользоваться без Söyle AI?", "Да. AI включается отдельно. Задания, AAC и базовый план остаются доступны без него."],
  ["AAC доступна вне занятия?", "Да. Ребёнок может открыть экран «Сказать» в любой момент и сообщить о важном без награды или оценки."],
  ["Что передаётся AI?", "Только после отдельного согласия: вопрос взрослого, возраст в полных годах и обезличенная сводка занятий. Имя и точная дата рождения не передаются."],
];

function Logo() {
  return (
    <span className="landing-logo">
      <Image src="/soyle-mark.svg" alt="" width={42} height={42} />
      <span><b>Söyle</b><small>общение и практика</small></span>
    </span>
  );
}

export function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);

  useEffect(() => {
    const root = document.querySelector(".landing-page");
    const items = document.querySelectorAll<HTMLElement>("[data-reveal]");
    if (!root || !items.length || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    root.classList.add("motion-ready");
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.14, rootMargin: "0px 0px -6%" });

    items.forEach((item) => observer.observe(item));
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", handleEscape);
    return () => {
      observer.disconnect();
      window.removeEventListener("keydown", handleEscape);
      root.classList.remove("motion-ready");
    };
  }, []);

  return (
    <div className="landing-page">
      <a className="skip-link" href="#main-content">Перейти к содержанию</a>

      <header className="landing-header">
        <div className="landing-container nav-wrap">
          <Link href="/" aria-label="Söyle - главная"><Logo /></Link>
          <nav id="landing-navigation" className={menuOpen ? "open" : ""} aria-label="Навигация по странице">
            <a href="#features" onClick={closeMenu}>Возможности</a>
            <a href="#how" onClick={closeMenu}>Как это работает</a>
            <a href="#safety" onClick={closeMenu}>Безопасность</a>
            <a href="#faq" onClick={closeMenu}>Вопросы</a>
            <Link className="mobile-login" href="/app" onClick={closeMenu}>Войти</Link>
          </nav>
          <div className="nav-actions">
            <Link className="button ghost" href="/app">Войти</Link>
            <Link className="button primary" href="/app">Начать <ArrowRight size={17} /></Link>
          </div>
          <button className="mobile-menu" onClick={() => setMenuOpen((open) => !open)} aria-expanded={menuOpen} aria-controls="landing-navigation" aria-label={menuOpen ? "Закрыть меню" : "Открыть меню"}>
            {menuOpen ? <X /> : <Menu />}
          </button>
        </div>
      </header>

      <main id="main-content">
        <section className="landing-hero">
          <div className="landing-container hero-grid">
            <div className="landing-hero-copy" data-reveal>
              <span className="eyebrow">Платформа для семьи</span>
              <h1>Ребёнку проще общаться. Взрослому - понимать, как помочь.</h1>
              <p>Söyle объединяет короткую домашнюю практику, AAC-коммуникацию и понятные рекомендации для родителей. Без давления, оценки и перегруженных экранов.</p>
              <div className="hero-actions">
                <Link className="button primary large" href="/app">Попробовать Söyle <ArrowRight size={19} /></Link>
                <a className="hero-text-link" href="#features">Посмотреть возможности</a>
              </div>
              <dl className="hero-facts" aria-label="Ключевые преимущества">
                <div><dt>3-10 минут</dt><dd>длительность практики</dd></div>
                <div><dt>Всегда</dt><dd>можно сделать паузу</dd></div>
                <div><dt>По согласию</dt><dd>подключается AI</dd></div>
              </dl>
            </div>

            <figure className="hero-photo" data-reveal>
              <Image
                src="/landing/soyle-hero-v3.webp"
                alt="Папа слушает дочь, которая выбирает визуальную карточку дома"
                width={1672}
                height={941}
                priority
                quality={92}
                sizes="(max-width: 980px) calc(100vw - 32px), 56vw"
              />
              <figcaption>Домашняя практика строится вокруг выбора ребёнка, а не результата.</figcaption>
            </figure>
          </div>
        </section>

        <section className="principles" aria-label="Принципы Söyle">
          <div className="landing-container principles-grid" data-reveal>
            <div><span>01</span><strong>Один шаг</strong><p>На экране только одно понятное действие.</p></div>
            <div><span>02</span><strong>AAC всегда рядом</strong><p>Коммуникация не зависит от результата занятия.</p></div>
            <div><span>03</span><strong>Без диагностики</strong><p>Только поддержка домашней практики.</p></div>
          </div>
        </section>

        <section className="landing-section feature-section" id="features">
          <div className="landing-container">
            <div className="section-heading" data-reveal>
              <span className="section-tag">ВОЗМОЖНОСТИ</span>
              <h2>Три части продукта, каждая со своей задачей</h2>
              <p>Мы разделили детский режим, коммуникацию и кабинет родителя, чтобы каждый экран отвечал на один конкретный вопрос.</p>
            </div>
            <div className="feature-stories">
              {features.map((feature, index) => (
                  <article className="feature-story" key={feature.label} data-reveal>
                    <span className="feature-index">0{index + 1}</span>
                    <figure className="story-media">
                      <Image src={feature.image} alt={feature.alt} width={1536} height={1024} quality={92} sizes="(max-width: 760px) calc(100vw - 32px), 54vw" />
                    </figure>
                    <div className="story-copy">
                      <span className="feature-label">{feature.label}</span>
                      <h3>{feature.title}</h3>
                      <p>{feature.text}</p>
                      <ul>{feature.points.map((point) => <li key={point}>{point}</li>)}</ul>
                    </div>
                  </article>
                ))}
            </div>
          </div>
        </section>

        <section className="landing-section how-section" id="how">
          <div className="landing-container how-grid">
            <div className="how-intro" data-reveal>
              <span className="section-tag">КАК ЭТО РАБОТАЕТ</span>
              <h2>От регистрации до первого занятия - три шага</h2>
              <p>Настройка занимает несколько минут. Остальное можно менять позже в кабинете родителя.</p>
              <Link href="/app" className="text-link">Открыть Söyle <ArrowRight size={17} /></Link>
            </div>
            <div className="how-copy" data-reveal>
              <ol className="steps-list">
                {steps.map(([number, title, text]) => (
                  <li key={number}>
                    <span>{number}</span>
                    <div><h3>{title}</h3><p>{text}</p></div>
                  </li>
                ))}
              </ol>
              <p className="how-note"><strong>Важно:</strong> ребёнок может остановиться или открыть AAC в любой момент. Завершение занятия не является обязательным.</p>
            </div>
          </div>
        </section>

        <section className="landing-section safety-section" id="safety">
          <div className="landing-container safety-panel" data-reveal>
            <div className="safety-copy">
              <span className="section-tag">ПРИВАТНОСТЬ И КОНТРОЛЬ</span>
              <h2>Технология помогает. Решения остаются за семьёй.</h2>
              <p>AI включается отдельным согласием. Имя ребёнка и точная дата рождения не передаются, а пользоваться основными возможностями можно без AI.</p>
            </div>
            <ul className="safety-points">
              <li><span>01</span><b>Не ставит диагноз</b><small>Söyle не заменяет специалиста.</small></li>
              <li><span>02</span><b>Согласие можно отозвать</b><small>Настройки всегда доступны родителю.</small></li>
              <li><span>03</span><b>Детский режим отделён</b><small>В нём нет отчётов и взрослых настроек.</small></li>
            </ul>
          </div>
        </section>

        <section className="landing-section faq-section" id="faq">
          <div className="landing-container faq-grid">
            <div data-reveal>
              <span className="section-tag">ЧАСТЫЕ ВОПРОСЫ</span>
              <h2>Коротко о важном</h2>
              <p>Собрали ответы о практике, AAC и приватности.</p>
              <a href="mailto:hello@soyle.app" className="text-link">Задать свой вопрос <ArrowRight size={16} /></a>
            </div>
            <div className="faq-list" data-reveal>
              {faqs.map(([question, answer]) => (
                <details key={question}>
                  <summary>{question}<ChevronDown /></summary>
                  <p>{answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="landing-cta">
          <div className="landing-container cta-inner" data-reveal>
            <div><span className="section-tag">НАЧАТЬ С МАЛОГО</span><h2>Один понятный шаг сегодня</h2><p>Создайте профиль и выберите удобную длительность первой практики.</p></div>
            <Link href="/app" className="button primary large">Попробовать Söyle <ArrowRight size={19} /></Link>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="landing-container footer-grid">
          <div><Logo /><p>Домашняя практика и поддерживаемая коммуникация для семьи.</p></div>
          <div><b>Платформа</b><a href="#features">Возможности</a><a href="#how">Как это работает</a><a href="#faq">Вопросы</a></div>
          <div><b>Документы</b><Link href="/privacy">Конфиденциальность</Link><Link href="/terms">Соглашение</Link><a href="mailto:hello@soyle.app">Контакты</a></div>
        </div>
        <div className="landing-container footer-bottom"><span>© 2026 Söyle</span><p>Söyle не является медицинским изделием и не заменяет консультацию врача или логопеда.</p></div>
      </footer>
    </div>
  );
}
