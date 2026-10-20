"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ChevronDown,
  Menu,
  X,
  Sparkles,
  Volume2,
  RotateCcw,
  Check,
} from "lucide-react";
import "@/app/landing.css";

const LANDING_THEME = "peach" as const;

const features = [
  {
    label: "Понимание речи",
    title: "Слышать задачу - без спешки и перегрузки",
    text: "Ребёнок получает один понятный шаг, слушает короткую инструкцию и выбирает ответ в своём темпе.",
    points: ["Без таймера и штрафов", "Повтор инструкции в любой момент"],
    image: "/landing/feature-listening-choice.webp",
    alt: "Мальчик слушает короткую инструкцию и выбирает одну из трёх равнозначных карточек",
  },
  {
    label: "AAC-коммуникация",
    title: "Важное можно сказать не только словами",
    text: "Визуальные карточки помогают попросить, отказаться, сообщить о самочувствии и составить короткую фразу.",
    points: ["Доступно до, во время и после занятия", "Выбор ребёнка не оценивается"],
    image: "/landing/feature-aac-tea-party.webp",
    alt: "Мальчик собирает просьбу из карточек во время игры с плюшевым мишкой",
  },
  {
    label: "Кабинет родителя",
    title: "Вместо потока данных - ясный следующий шаг",
    text: "История практики, настройки приватности и спокойные рекомендации собраны отдельно от детского режима.",
    points: ["Прогресс без диагностических выводов", "Адаптация без внешней AI API"],
    image: "/landing/feature-parent-evening-review.webp",
    alt: "Мама вечером просматривает спокойную сводку занятия на планшете",
  },
];

const steps = [
  ["01", "Создайте профиль", "Укажите только то, что помогает настроить удобную практику."],
  ["02", "Выберите 3, 5 или 10 минут", "Короткий формат легче встроить в реальный семейный день."],
  ["03", "Начните с одного действия", "Söyle ведёт по шагам, а остановиться можно в любой момент."],
];

const faqs = [
  ["С чего начать, если ребёнок быстро устаёт?", "Выберите практику на 3 минуты: в таком плане два задания. Начните рядом с ребёнком, повторяйте инструкцию при необходимости и делайте паузу, когда она нужна. Завершать весь план необязательно."],
  ["Нужна ли камера для всех занятий?", "Нет. Камера нужна только для отдельных упражнений и включается с отдельного согласия. Анализ выполняется в браузере, кадры и координаты лица не сохраняются и не отправляются на сервер."],
  ["Что родитель увидит после занятия?", "Историю выполненных заданий, результаты практики и объяснение следующего предложенного шага. Бытовые наблюдения сохраняются отдельно от игровых результатов."],
  ["Можно ли исключить неудобное задание?", "Да. Родитель управляет предпочтениями и исключениями. При составлении плана платформа учитывает эти настройки и активные цели."],
  ["Söyle заменяет логопеда?", "Нет. Платформа помогает организовать домашнюю практику, но не ставит диагноз и не заменяет врача или логопеда."],
  ["Как работает адаптивный подбор?", "Söyle локально анализирует последние игровые ответы: свежие результаты имеют больший вес, а задания проходят ротацию без лишних повторов."],
  ["AAC доступна вне занятия?", "Да. Ребёнок может открыть экран «Сказать» в любой момент и сообщить о важном без награды или оценки."],
  ["Что передаётся внешней AI?", "Ничего. Подбор сложности и подсказки работают по локальным проверяемым правилам без подключения к поставщику модели."],
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
  const [selectedCard, setSelectedCard] = useState("water");
  const [spoken, setSpoken] = useState(false);
  const [speechError, setSpeechError] = useState(false);
  const speechAudio = useRef<HTMLAudioElement>(null);
  const [exerciseTab, setExerciseTab] = useState(0);
  const [duration, setDuration] = useState(5);
  const closeMenu = () => setMenuOpen(false);

  useEffect(() => {
    const previousTheme = document.documentElement.dataset.theme;
    document.documentElement.dataset.theme = LANDING_THEME;
    const restoreTheme = () => {
      if (previousTheme) document.documentElement.dataset.theme = previousTheme;
      else delete document.documentElement.dataset.theme;
    };
    const root = document.querySelector(".landing-page");
    const items = document.querySelectorAll<HTMLElement>("[data-reveal]");
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncMotion = () => root?.classList.toggle("motion-ready", !motion.matches);
    motion.addEventListener("change", syncMotion);
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", handleEscape);
    if (!root || !items.length) return () => {
      window.removeEventListener("keydown", handleEscape);
      motion.removeEventListener("change", syncMotion);
      restoreTheme();
    };

    syncMotion();
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.08, rootMargin: "0px 0px -4%" });

    items.forEach((item) => observer.observe(item));
    return () => {
      observer.disconnect();
      window.removeEventListener("keydown", handleEscape);
      root.classList.remove("motion-ready");
      motion.removeEventListener("change", syncMotion);
      restoreTheme();
    };
  }, []);

  return (
    <div className="landing-page" data-theme={LANDING_THEME}>
      <a className="skip-link" href="#main-content">Перейти к содержанию</a>

      <header className="landing-header">
        <div className="reading-progress" aria-hidden="true" />
        <div className="landing-container nav-wrap">
          <Link href="/" aria-label="Söyle - главная"><Logo /></Link>
          <nav id="landing-navigation" className={menuOpen ? "open" : ""} aria-label="Навигация по странице">
            <a href="#features" onClick={closeMenu}>Возможности</a>
            <a href="#practice" onClick={closeMenu}>Занятия</a>
            <a href="#parents" onClick={closeMenu}>Родителям</a>
            <a href="#how" onClick={closeMenu}>Как начать</a>
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
              <span className="eyebrow"><Sparkles size={14} /> Маленькие шаги. Большое понимание.</span>
              <h1>Общаться. Играть.<br /><em>Понимать друг друга.</em></h1>
              <p>Söyle помогает семье заниматься дома: понимать речь, собирать фразы из карточек и практиковаться короткими игровыми шагами. Ребёнок выбирает свой темп. Родитель видит, что делать дальше.</p>
              <div className="hero-actions">
                <Link className="button primary large" href="/app">Попробовать Söyle <ArrowRight size={19} /></Link>
                <a className="hero-text-link" href="#try">Попробовать карточки</a>
              </div>
              <dl className="hero-facts" aria-label="Ключевые преимущества">
                <div><dt>3-10 минут</dt><dd>длительность практики</dd></div>
                <div><dt>Всегда</dt><dd>можно сделать паузу</dd></div>
                <div><dt>Локально</dt><dd>работает адаптация</dd></div>
              </dl>
            </div>

            <figure className="hero-photo" data-reveal>
              <span className="photo-orbit" aria-hidden="true" />
              <span className="floating-note note-top"><span>✦</span> В своём темпе</span>
              <Image
                src="/landing/hero-family-aac-request.webp"
                alt="Папа слушает сына, который показывает карточку с просьбой о воде"
                width={1672}
                height={941}
                priority
                quality={75}
                sizes="(max-width: 980px) calc(100vw - 32px), 56vw"
              />
              <figcaption><span className="note-check"><Check size={18} /></span><span><b>Меня понимают</b><small>И это уже большой шаг</small></span></figcaption>
            </figure>
          </div>
        </section>

        <section className="principles" aria-label="Принципы Söyle">
          <div className="landing-container principles-grid">
            <div data-reveal><span>01</span><strong>Один шаг</strong><p>На экране только одно понятное действие.</p></div>
            <div data-reveal><span>02</span><strong>AAC всегда рядом</strong><p>Коммуникация не зависит от результата занятия.</p></div>
            <div data-reveal><span>03</span><strong>Без диагностики</strong><p>Только поддержка домашней практики.</p></div>
          </div>
        </section>

        <section className="landing-section demo-section" id="try">
          <div className="landing-container demo-grid">
            <div className="demo-copy" data-reveal><span className="section-tag">ПОПРОБУЙТЕ ПРЯМО ЗДЕСЬ</span><h2>Иногда одна карточка<br />говорит о многом.</h2><p>Выберите, что хочется сказать. Так визуальные карточки помогают ребёнку сообщить о своём желании.</p><span className="demo-hint"><Sparkles size={18} /> Маленький пример AAC-коммуникации</span></div>
            <div className="aac-preview" data-reveal="scale">
              <div className="preview-heading"><span><i /> Экран «Сказать»</span><small>Демо</small></div>
              <div className="demo-sentence" aria-live="polite"><span>Я хочу</span><strong key={selectedCard}>{selectedCard === "water" ? "воду" : selectedCard === "apple" ? "яблоко" : "играть"}</strong></div>
              <div className="demo-cards">{[{ id: "water", label: "Воду", image: "/p15/nouns/food/water.svg" }, { id: "apple", label: "Яблоко", image: "/p15/nouns/food/apple.svg" }, { id: "play", label: "Играть", image: "/p15/nouns/toys/ball.svg" }].map((card) => <button key={card.id} aria-pressed={selectedCard === card.id} onClick={() => { speechAudio.current?.pause(); setSelectedCard(card.id); setSpoken(false); setSpeechError(false); }}><Image src={card.image} alt="" width={72} height={72} /><span>{card.label}</span>{selectedCard === card.id && <Check size={16} className="card-check" />}</button>)}</div>
              <audio ref={speechAudio} preload="none" onEnded={() => setSpoken(false)} onError={() => { setSpoken(false); setSpeechError(true); }} />
              <div className="demo-controls"><button className="button primary" onClick={() => {
                const audio = speechAudio.current;
                if (!audio) return;
                if (spoken) { audio.pause(); setSpoken(false); return; }
                audio.src = `/audio/landing/${selectedCard}.wav`;
                audio.volume = 0.85;
                setSpeechError(false);
                setSpoken(true);
                void audio.play().catch(() => { setSpoken(false); setSpeechError(true); });
              }}><Volume2 size={19} /> {spoken ? "Остановить" : "Произнести"}</button><button className="demo-reset" aria-label="Сбросить пример" onClick={() => { speechAudio.current?.pause(); setSelectedCard("water"); setSpoken(false); setSpeechError(false); }}><RotateCcw size={19} /></button></div>
              {speechError && <p role="status" className="demo-caption">Не удалось включить звук. Попробуйте ещё раз.</p>}
              <p className="demo-caption">Без оценок. Просто возможность быть услышанным.</p>
            </div>
          </div>
        </section>

        <section className="landing-section feature-section" id="features">
          <div className="landing-container">
            <div className="section-heading" data-reveal>
              <span className="section-tag">ВОЗМОЖНОСТИ</span>
              <h2>Меньше барьеров.<br />Больше моментов вместе.</h2>
              <p>Мы разделили детский режим, коммуникацию и кабинет родителя, чтобы каждый экран отвечал на один конкретный вопрос.</p>
            </div>
            <div className="feature-stories">
              {features.map((feature, index) => (
                  <article className="feature-story" key={feature.label}>
                    <span className="feature-index">0{index + 1}</span>
                    <figure className="story-media" data-reveal="image">
                      <Image src={feature.image} alt={feature.alt} width={1536} height={1024} quality={75} sizes="(max-width: 760px) calc(100vw - 32px), 54vw" />
                    </figure>
                    <div className="story-copy" data-reveal="side">
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

        <section className="landing-section exercise-section" id="practice">
          <div className="landing-container">
            <div className="section-heading" data-reveal><span className="section-tag">ВНУТРИ ЗАНЯТИЯ</span><h2>Понятные задания.<br />Разные способы участвовать.</h2><p>Послушать, выбрать картинку, собрать фразу — задания связаны с конкретным действием. Можно повторить инструкцию или остановиться.</p></div>
            <div className="exercise-tabs" role="group" aria-label="Примеры направлений практики">{["Понимание речи", "Артикуляция", "Фразы и желания"].map((label, index) => <button key={label} aria-pressed={exerciseTab === index} onClick={() => setExerciseTab(index)}>{label}</button>)}</div>
            <div className="exercise-showcase" data-reveal>
              <div className="exercise-illustration"><Image src={["/landing/practice-listening-girl.webp", "/landing/practice-articulation-mirror.webp", "/landing/practice-phrases-banana.webp"][exerciseTab]} alt={["Девочка слушает инструкцию и выбирает из карточек с ложкой, чашкой и книгой", "Мальчик и мама тренируют движение губ перед зеркалом", "Мальчик составляет просьбу о банане из двух карточек"][exerciseTab]} width={1585} height={992} sizes="(max-width: 760px) 85vw, 40vw" /></div>
              <div className="exercise-description" key={exerciseTab} aria-live="polite"><span className="section-tag">ПРИМЕР НАПРАВЛЕНИЯ</span><h3>{["Услышать и выбрать", "Повторить движение", "Сообщить о своём желании"][exerciseTab]}</h3><p>{["Ребёнок слушает короткую инструкцию и выбирает подходящую картинку. Повторное прослушивание помогает вернуться к заданию без спешки.", "Визуальный пример помогает понять, какое движение нужно выполнить. Для заданий с камерой требуется отдельное согласие: обработка идёт на устройстве.", "Визуальные карточки помогают собрать короткую фразу. Общение остаётся доступным и за пределами практики — на экране «Сказать»."][exerciseTab]}</p><ul><li>Одна инструкция за раз</li><li>Пауза и отказ без штрафов</li><li>Темп выбирает ребёнок</li></ul><a className="text-link" href="#try">Попробовать пример с карточками <ArrowRight size={17} /></a></div>
            </div>
          </div>
        </section>

        <section className="landing-section routine-section">
          <div className="landing-container routine-grid">
            <div data-reveal><span className="section-tag">ПРАКТИКА В ОБЫЧНОЙ ЖИЗНИ</span><h2>Не отдельный большой урок.<br />Небольшая часть дня.</h2><p>Выберите момент, когда ребёнку удобно. Söyle помогает организовать практику, а длительность можно менять от занятия к занятию.</p><Link className="text-link" href="/app">Выбрать первую практику <ArrowRight size={17} /></Link></div>
            <div className="routine-list">{[["До занятия", "Подготовьте спокойное место", "Откройте план вместе с ребёнком. Проверьте звук, посмотрите первое задание и дайте время освоиться."], ["Во время", "Следуйте за темпом ребёнка", "Повторите инструкцию, сделайте паузу или откройте AAC. Можно отказаться от задания и закончить раньше."], ["После", "Посмотрите, что было удобно", "Откройте историю практики. При желании добавьте своё наблюдение и скорректируйте цели следующего занятия."]].map(([label,title,text]) => <article key={label} data-reveal><span>{label}</span><h3>{title}</h3><p>{text}</p></article>)}</div>
          </div>
        </section>

        <section className="landing-section adaptation-section" id="adaptation">
          <div className="landing-container">
            <div className="section-heading" data-reveal><span className="section-tag">ПОНЯТНАЯ АДАПТАЦИЯ</span><h2>Следующий шаг имеет причину.</h2><p>План учитывает недавнюю практику, активные цели и настройки семьи. Родитель может посмотреть, почему предложено конкретное задание.</p></div>
            <ol className="adaptation-flow">{[["01", "Последние ответы", "Учитываются до восьми последних завершённых результатов. Свежие ответы влияют на подбор сильнее."], ["02", "Подходящий уровень", "Оцениваются точность и самостоятельность. Если данных мало, сохраняется спокойный стартовый уровень."], ["03", "Разнообразие заданий", "Сначала предлагаются новые и реже использованные упражнения. Внутри плана задания не повторяются."], ["04", "Объяснение родителю", "Причины выбора сохраняются вместе с планом: можно понять, как получился следующий шаг."]].map(([n,title,text]) => <li key={n} data-reveal><span>{n}</span><h3>{title}</h3><p>{text}</p></li>)}</ol>
            <div className="adaptation-note" data-reveal><strong>Перерыв — это перерыв.</strong><p>Отказ, пауза и техническая ошибка не считаются неправильным ответом. Алгоритм работает по проверяемым правилам без внешней AI API.</p></div>
          </div>
        </section>

        <section className="landing-section parent-detail-section" id="parents">
          <div className="landing-container parent-detail-grid">
            <figure data-reveal="image"><Image src="/landing/parent-controls-family.webp" alt="Родители вместе настраивают приватность и параметры практики, пока ребёнок играет рядом" width={1586} height={992} sizes="(max-width: 860px) 90vw, 45vw" /><figcaption>Наблюдения семьи и игровые результаты хранятся отдельно.</figcaption></figure>
            <div data-reveal="side"><span className="section-tag">ДЛЯ РОДИТЕЛЯ</span><h2>Видеть картину.<br />Управлять следующим шагом.</h2><p>Взрослая часть отделена от детского режима. Здесь можно спокойно посмотреть историю и настроить практику под вашу семью.</p><dl className="parent-tools"><div><dt>Цели практики</dt><dd>Определяйте, над чем хотите работать, и возвращайтесь к целям по мере занятий.</dd></div><div><dt>История и наблюдения</dt><dd>Смотрите завершённые занятия и сохраняйте то, что заметили в повседневной жизни.</dd></div><div><dt>Предпочтения и исключения</dt><dd>Убирайте неудобные задания из подбора и меняйте настройки практики.</dd></div><div><dt>Приватность и согласия</dt><dd>Управляйте разрешениями в кабинете и отзывайте согласие, когда это нужно.</dd></div></dl></div>
          </div>
        </section>

        <section className="landing-section how-section" id="how">
          <div className="landing-container how-grid">
            <div className="how-intro" data-reveal>
              <span className="section-tag">КАК ЭТО РАБОТАЕТ</span>
              <h2>От регистрации до первого занятия - три шага</h2>
              <p>Настройка занимает несколько минут. Остальное можно менять позже в кабинете родителя.</p>
              <div className="practice-picker">
                <span id="duration-label">Сколько времени есть сегодня?</span>
                <div role="group" aria-labelledby="duration-label" className="duration-options">{[3, 5, 10].map((minutes) => <button key={minutes} aria-pressed={duration === minutes} onClick={() => setDuration(minutes)}>{minutes} мин</button>)}</div>
                <p aria-live="polite" key={duration} className="duration-note">{duration === 3 ? "Для первого знакомства или короткой паузы в делах." : duration === 5 ? "Немного практики, которую легко встроить в день." : "Больше времени на задания — с паузами, когда нужно."}</p>
                <small>Это пример длительности. Настройка занятия — в приложении.</small>
              </div>
              <Link href="/app" className="text-link">Открыть Söyle <ArrowRight size={17} /></Link>
            </div>
            <div className="how-copy">
              <ol className="steps-list">
                {steps.map(([number, title, text]) => (
                  <li key={number} data-reveal>
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
          <div className="landing-container safety-panel">
            <div className="safety-copy" data-reveal>
              <span className="section-tag">ПРИВАТНОСТЬ И КОНТРОЛЬ</span>
              <h2>Технология помогает. Решения остаются за семьёй.</h2>
              <p>Адаптивный анализ работает внутри платформы: учитывает последние ответы, выбирает уровень и не отправляет данные во внешнюю AI API.</p>
            </div>
            <ul className="safety-points">
              <li data-reveal><span>01</span><b>Не ставит диагноз</b><small>Söyle не заменяет специалиста.</small></li>
              <li data-reveal><span>02</span><b>Согласие можно отозвать</b><small>Настройки всегда доступны родителю.</small></li>
              <li data-reveal><span>03</span><b>Детский режим отделён</b><small>В нём нет отчётов и взрослых настроек.</small></li>
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
            <div className="faq-list">
              {faqs.map(([question, answer]) => (
                <details key={question} data-reveal>
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
