"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import {
  ArrowRight,
  Check,
  ChevronDown,
  Clock3,
  Menu,
  Pause,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import "@/app/landing.css";

const features = [
  {
    label: "Понимание речи",
    title: "Слушать, выбирать, повторять",
    text: "Короткие задания без таймера и лишних эффектов. Ребёнок видит один понятный шаг за раз.",
    image: "/landing/listening-at-home.webp",
    alt: "Ребёнок в наушниках выбирает визуальную карточку на планшете",
  },
  {
    label: "AAC-коммуникация",
    title: "Сказать важное в любой момент",
    text: "Карточки помогают попросить, отказаться, сообщить о самочувствии или составить короткую фразу.",
    image: "/landing/aac-at-home.webp",
    alt: "Ребёнок показывает маме выбранные карточки на планшете",
  },
  {
    label: "Для взрослого",
    title: "Понять следующий шаг",
    text: "История занятий, спокойные подсказки и настройки приватности собраны отдельно от детского режима.",
    image: "/landing/parent-guidance.webp",
    alt: "Мама смотрит рекомендации на планшете рядом с ребёнком",
  },
];

const steps = [
  ["1", "Создайте профиль", "Выберите язык и удобную длительность занятия."],
  ["2", "Начните с одного шага", "Söyle покажет короткое задание без перегруженных экранов."],
  ["3", "Поддержите общение", "AAC остаётся доступной до, во время и после занятия."],
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
      <Image src="/soyle-mark-v2.png" alt="" width={42} height={42} />
      <span><b>Söyle</b><small>растём вместе</small></span>
    </span>
  );
}

export function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);

  return (
    <div className="landing-page">
      <a className="skip-link" href="#main-content">Перейти к содержанию</a>

      <header className="landing-header">
        <div className="landing-container nav-wrap">
          <Link href="/" aria-label="Söyle — главная"><Logo /></Link>
          <nav className={menuOpen ? "open" : ""} aria-label="Навигация по странице">
            <a href="#features" onClick={closeMenu}>Возможности</a>
            <a href="#how" onClick={closeMenu}>Как начать</a>
            <a href="#safety" onClick={closeMenu}>Безопасность</a>
            <a href="#faq" onClick={closeMenu}>Вопросы</a>
            <Link className="mobile-login" href="/app" onClick={closeMenu}>Войти</Link>
          </nav>
          <div className="nav-actions">
            <Link className="button ghost" href="/app">Войти</Link>
            <Link className="button primary" href="/app">Попробовать <ArrowRight size={17} /></Link>
          </div>
          <button className="mobile-menu" onClick={() => setMenuOpen((open) => !open)} aria-expanded={menuOpen} aria-label={menuOpen ? "Закрыть меню" : "Открыть меню"}>
            {menuOpen ? <X /> : <Menu />}
          </button>
        </div>
      </header>

      <main id="main-content">
        <section className="landing-hero">
          <div className="landing-container hero-grid">
            <div className="landing-hero-copy">
              <span className="eyebrow"><Sparkles size={16} /> Домашняя практика и AAC</span>
              <h1>Ребёнку проще сказать. Взрослому — понять, как помочь.</h1>
              <p>Söyle объединяет короткие игровые задания, визуальную коммуникацию и понятные подсказки для семьи — без давления и перегруженных экранов.</p>
              <div className="hero-actions">
                <Link className="button primary large" href="/app">Попробовать Söyle <ArrowRight size={19} /></Link>
                <a className="button secondary large" href="#features">Посмотреть возможности</a>
              </div>
              <div className="trust-row" aria-label="Преимущества">
                <span><Clock3 /> От 3 минут</span>
                <span><Pause /> Можно остановиться</span>
                <span><ShieldCheck /> AI только с согласия</span>
              </div>
            </div>

            <figure className="hero-photo">
              <Image
                src="/landing/family-hero.webp"
                alt="Мама и ребёнок занимаются с визуальными карточками дома"
                width={1536}
                height={1024}
                priority
                sizes="(max-width: 980px) calc(100vw - 48px), 52vw"
              />
              <figcaption>Домашняя практика без давления</figcaption>
            </figure>
          </div>
        </section>

        <section className="landing-section feature-section" id="features">
          <div className="landing-container">
            <div className="section-heading">
              <span className="section-tag">ВОЗМОЖНОСТИ</span>
              <h2>Три понятных сценария вместо сложной системы</h2>
              <p>Каждый экран помогает выполнить одно действие и сразу показывает результат.</p>
            </div>
            <div className="feature-grid">
              {features.map((feature) => (
                <article key={feature.label}>
                  <div className="feature-art"><Image src={feature.image} alt={feature.alt} width={724} height={543} sizes="(max-width: 980px) 42vw, 33vw" /></div>
                  <span className="feature-label">{feature.label}</span>
                  <h3>{feature.title}</h3>
                  <p>{feature.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="landing-section how-section" id="how">
          <div className="landing-container how-grid">
            <div className="how-copy">
              <span className="section-tag">КАК НАЧАТЬ</span>
              <h2>Спокойный маршрут на каждый день</h2>
              <p>Не нужно настраивать сложную программу. Начните с короткого занятия, а темп можно изменить в любой момент.</p>
              <Link href="/app" className="text-link">Открыть Söyle <ArrowRight size={17} /></Link>
            </div>
            <ol className="steps-list">
              {steps.map(([number, title, text]) => (
                <li key={number}>
                  <span>{number}</span>
                  <div><h3>{title}</h3><p>{text}</p></div>
                  <Check aria-hidden="true" />
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="landing-section safety-section" id="safety">
          <div className="landing-container safety-panel">
            <div className="safety-symbol"><ShieldCheck /></div>
            <div>
              <span className="section-tag">БЕЗОПАСНОСТЬ</span>
              <h2>Родитель сохраняет контроль</h2>
              <p>AI включается отдельным согласием. Детский режим не показывает настройки и отчёты, а AAC всегда доступна без оценки, таймера и награды.</p>
            </div>
            <ul>
              <li><Check /> Не ставит диагноз</li>
              <li><Check /> Не заменяет специалиста</li>
              <li><Check /> Можно пользоваться без AI</li>
            </ul>
          </div>
        </section>

        <section className="landing-section faq-section" id="faq">
          <div className="landing-container faq-grid">
            <div>
              <span className="section-tag">ЧАСТЫЕ ВОПРОСЫ</span>
              <h2>Коротко о важном</h2>
              <p>Если ответа нет, напишите нам — разберёмся вместе.</p>
              <a href="mailto:hello@soyle.app" className="text-link">hello@soyle.app <ArrowRight size={16} /></a>
            </div>
            <div className="faq-list">
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
          <div className="landing-container cta-inner">
            <div><span className="section-tag">НАЧАТЬ С МАЛОГО</span><h2>Один понятный шаг сегодня</h2><p>Создайте профиль и выберите удобную длительность занятия.</p></div>
            <Link href="/app" className="button light-button large">Попробовать Söyle <ArrowRight size={19} /></Link>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="landing-container footer-grid">
          <div><Logo /><p>Домашняя практика и поддерживаемая коммуникация для семьи.</p></div>
          <div><b>Платформа</b><a href="#features">Возможности</a><a href="#how">Как начать</a><a href="#faq">Вопросы</a></div>
          <div><b>Документы</b><Link href="/privacy">Конфиденциальность</Link><Link href="/terms">Соглашение</Link><a href="mailto:hello@soyle.app">Контакты</a></div>
        </div>
        <div className="landing-container footer-bottom"><span>© 2026 Söyle</span><p>Söyle не является медицинским изделием и не заменяет консультацию врача или логопеда.</p></div>
      </footer>
    </div>
  );
}
