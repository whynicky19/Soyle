"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import {
  ArrowRight, BookOpen, Brain, Check, ChevronDown, Clock3, HeartHandshake,
  Menu, MessageSquareText, Mic2, ShieldCheck, Sparkles, Target, Users, X,
} from "lucide-react";
import "@/app/landing.css";

const audiences = [
  { icon: Sparkles, title: "Детям", text: "Короткие понятные занятия и доступный способ сообщить о важном." },
  { icon: HeartHandshake, title: "Родителям", text: "Домашняя практика без давления и понятная история занятий." },
  { icon: Users, title: "Специалистам", text: "Цели, назначения и описательные данные занятий в одном рабочем пространстве." },
  { icon: BookOpen, title: "Центрам", text: "Единый подход для семьи, педагогов и коррекционной команды." },
];

const capabilities = [
  "Визуальное зеркало по назначению", "Игровые задания на слух",
  "AAC-коммуникация", "Персональные программы", "Ежедневные короткие занятия",
  "Домашние задания", "Понятная история занятий", "Связь семьи со специалистом",
];

const steps = [
  ["01", "Специалист определяет цели", "Выбирает навыки, критерии и подходящий уровень сложности."],
  ["02", "Ребёнок занимается", "Выполняет спокойную последовательность коротких игровых заданий."],
  ["03", "Родитель поддерживает дома", "Закрепляет один навык в понятной повседневной ситуации."],
  ["04", "Söyle сохраняет ход занятий", "Отделяет игровые ответы, участие, отказ, перерыв и техническую ошибку."],
  ["05", "Специалист корректирует план", "Вручную назначает цели, упражнения и домашнюю практику."],
];

const directions = [
  { icon: Mic2, number: "01", title: "Зеркало", text: "Визуальная практика перед локальным зеркалом камеры — только после назначения специалистом.", note: "Приложение не анализирует изображение и не оценивает правильность движения или речи.", image: "/landing/child-session.jpg", alt: "Ребёнок выполняет назначенную специалистом практику перед зеркалом" },
  { icon: Brain, number: "02", title: "Понимаю", text: "Слова, изображения, действия и инструкции с повтором и постепенным усложнением.", note: "Темп и сложность можно адаптировать под индивидуальную программу.", image: "/landing/parent-child.jpg", alt: "Родитель помогает ребёнку сделать выбор с помощью визуальных карточек" },
  { icon: MessageSquareText, number: "03", title: "Общаюсь", text: "Полноэкранная AAC-доска для составления и озвучивания фраз в любой момент.", note: "Быстрые фразы, избранное, история и личный словарь всегда под рукой.", image: "/landing/aac-communication.jpg", alt: "Ребёнок использует AAC-карточки на планшете для общения" },
];

const faqs = [
  ["Söyle заменяет логопеда?", "Нет. Платформа помогает организовать практику и коммуникацию, но цели и упражнения необходимо согласовывать со специалистом."],
  ["Камера записывает или анализирует ребёнка?", "Нет. После отдельного согласия браузер показывает локальное зеркало. Приложение не анализирует изображение, не сохраняет видео и не отправляет его на сервер."],
  ["Можно пользоваться AAC-доской без занятия?", "Да. Визуальная коммуникация доступна отдельно и не требует прохождения упражнения или получения награды."],
  ["Как формируется персональный план?", "Сначала показываются назначения специалиста, затем безопасные игровые задания для разнообразия. Моторная практика автоматически не назначается."],
  ["Подходит ли платформа образовательному центру?", "Технически роли и назначения предусмотрены, но внешний пилот требует отдельного допуска специалиста, юриста по данным, accessibility-проверки и готовой production-инфраструктуры."],
];

function Logo() {
  return <span className="landing-logo"><Image src="/soyle-mark-v2.png" alt="" width={42} height={42} /><span><b>Söyle</b><small>растём вместе</small></span></span>;
}

export function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);
  return <div className="landing-page">
    <a className="skip-link" href="#main-content">Перейти к содержанию</a>
    <header className="landing-header">
      <div className="landing-container nav-wrap">
        <Link href="/" aria-label="Söyle — главная"><Logo /></Link>
        <nav className={menuOpen ? "open" : ""} aria-label="Навигация по странице">
          <a href="#about" onClick={closeMenu}>О платформе</a>
          <a href="#directions" onClick={closeMenu}>Направления</a>
          <a href="#how" onClick={closeMenu}>Как работает</a>
          <a href="#faq" onClick={closeMenu}>Вопросы</a>
          <Link className="mobile-login" href="/app" onClick={closeMenu}>Войти</Link>
        </nav>
        <div className="nav-actions">
          <Link className="button ghost" href="/app">Войти</Link>
          <Link className="button primary" href="/app">Начать <ArrowRight size={17}/></Link>
        </div>
        <button className="mobile-menu" onClick={() => setMenuOpen(!menuOpen)} aria-expanded={menuOpen} aria-label={menuOpen ? "Закрыть меню" : "Открыть меню"}>{menuOpen ? <X/> : <Menu/>}</button>
      </div>
    </header>

    <main id="main-content">
      <section className="landing-hero">
        <div className="landing-container hero-grid">
          <div className="landing-hero-copy">
            <span className="eyebrow"><Sparkles size={15}/> Коммуникация начинается с возможности быть услышанным</span>
            <h1>Помогаем ребёнку <em>понимать и общаться</em> в своём темпе</h1>
            <p>Söyle объединяет ребёнка, родителя и специалиста в одной персональной программе домашней практики и поддерживаемой коммуникации.</p>
            <div className="hero-actions"><Link className="button primary large" href="/app">Начать бесплатно <ArrowRight size={19}/></Link><a className="button secondary large" href="#about">Узнать больше</a></div>
            <div className="trust-row"><span><ShieldCheck/>Камера — только локальное зеркало</span><span><Clock3/>Занятия от 3 минут</span></div>
          </div>
          <div className="hero-media"><Image src="/landing/soyle-hero.jpg" alt="Родитель и ребёнок вместе занимаются с визуальными карточками" fill priority sizes="(max-width: 900px) 100vw, 52vw"/><span className="hero-float"><span className="float-icon"><MessageSquareText/></span><span><b>Я могу сообщить о важном</b><small>AAC-карточки доступны всегда</small></span></span></div>
        </div>
      </section>

      <section className="landing-section about-section" id="about">
        <div className="landing-container split-intro">
          <div><span className="section-tag">О ПЛАТФОРМЕ</span><h2>Поддержка, которая продолжается между встречами со специалистом</h2></div>
          <div><p>Söyle помогает выполнять назначенные цели в коротких игровых занятиях и понятной домашней практике. Семья видит план на сегодня, а специалист — записи об участии, помощи и игровых ответах.</p><div className="safety-note"><ShieldCheck/><span><b>Важно</b>Söyle не ставит диагноз, не измеряет развитие речи и не заменяет врача, логопеда или другого профильного специалиста.</span></div></div>
        </div>
        <div className="landing-container audience-grid">{audiences.map(({icon: Icon, title, text}) => <article key={title}><span><Icon/></span><h3>{title}</h3><p>{text}</p></article>)}</div>
      </section>

      <section className="landing-section capabilities-section">
        <div className="landing-container media-split"><div className="feature-image"><Image src="/landing/specialist-parent.jpg" alt="Специалист и родитель вместе изучают динамику занятий ребёнка" fill sizes="(max-width: 800px) 100vw, 48vw"/></div><div className="feature-copy"><span className="section-tag">ВОЗМОЖНОСТИ</span><h2>Одна программа для занятий, дома и работы специалиста</h2><p>Все участники видят одну цель и поддерживают ребёнка последовательно — без перегруженных отчётов и жёсткой геймификации.</p><div className="check-grid">{capabilities.map(item => <span key={item}><i><Check size={14}/></i>{item}</span>)}</div></div></div>
      </section>

      <section className="landing-section directions-section" id="directions">
        <div className="landing-container section-heading-center"><span className="section-tag">ТРИ НАПРАВЛЕНИЯ</span><h2>Зеркало, игровые задания на слух и AAC-коммуникация</h2><p>Визуальное зеркало доступно только по назначению специалиста; AAC остаётся доступной независимо от занятия.</p></div>
        <div className="landing-container direction-list">{directions.map(({icon:Icon,...item}, index) => <article className={index % 2 ? "reverse" : ""} key={item.title}><div className="direction-media"><Image src={item.image} alt={item.alt} fill sizes="(max-width: 800px) 100vw, 46vw"/></div><div className="direction-copy"><span className="direction-number">{item.number}</span><span className="direction-icon"><Icon/></span><h3>{item.title}</h3><p>{item.text}</p><small>{item.note}</small><Link href="/app">Открыть направление <ArrowRight size={16}/></Link></div></article>)}</div>
      </section>

      <section className="landing-section how-section" id="how"><div className="landing-container"><div className="section-heading-center light"><span className="section-tag">КАК ЭТО РАБОТАЕТ</span><h2>Спокойный и предсказуемый путь</h2><p>Решение всегда остаётся за семьёй и специалистом.</p></div><div className="steps-grid">{steps.map(([number,title,text]) => <article key={number}><span>{number}</span><h3>{title}</h3><p>{text}</p></article>)}</div></div></section>

      <section className="landing-section family-section"><div className="landing-container family-grid"><div className="family-copy"><span className="section-tag">ВМЕСТЕ</span><h2>Родитель поддерживает. Специалист направляет.</h2><p>Родитель получает одно короткое домашнее задание и отмечает уровень помощи. Специалист рассматривает записи в контексте и меняет программу вручную.</p><div className="role-pills"><span><HeartHandshake/>Для семьи</span><span><Target/>Для специалиста</span></div><Link href="/app" className="button primary">Создать аккаунт <ArrowRight size={17}/></Link></div><div className="family-media"><Image src="/landing/parent-child.jpg" alt="Родитель поддерживает выбор ребёнка с помощью карточек" fill sizes="(max-width: 800px) 100vw, 48vw"/></div></div></section>

      <section className="landing-section faq-section" id="faq"><div className="landing-container faq-grid"><div><span className="section-tag">ЧАСТЫЕ ВОПРОСЫ</span><h2>Прозрачно о занятиях, данных и рекомендациях</h2><p>Если вашего вопроса нет в списке, напишите нам — мы поможем разобраться.</p><a href="mailto:hello@soyle.app" className="text-link">hello@soyle.app <ArrowRight size={16}/></a></div><div className="faq-list">{faqs.map(([question,answer],index) => <details key={question} open={index===0}><summary>{question}<ChevronDown/></summary><p>{answer}</p></details>)}</div></div></section>

      <section className="landing-cta"><div className="landing-container cta-inner"><div><span className="section-tag">НАЧАТЬ МОЖНО С МАЛОГО</span><h2>Три спокойные минуты практики сегодня</h2><p>Создайте профиль ребёнка, выберите направление и согласуйте цели со специалистом.</p></div><Link href="/app" className="button light-button large">Начать <ArrowRight size={19}/></Link></div></section>
    </main>

    <footer className="landing-footer"><div className="landing-container footer-grid"><div><Logo/><p>Поддерживаемая коммуникация, игровые задания и назначенная домашняя практика в одной программе.</p></div><div><b>Платформа</b><a href="#about">О Söyle</a><a href="#directions">Направления</a><a href="#faq">Вопросы</a></div><div><b>Документы</b><a href="/privacy">Конфиденциальность</a><a href="/terms">Пользовательское соглашение</a><a href="mailto:hello@soyle.app">Контакты</a></div></div><div className="landing-container footer-bottom"><span>© 2026 Söyle</span><p>Söyle не является медицинским изделием, не ставит диагноз и не заменяет консультацию специалиста.</p></div></footer>
  </div>;
}
