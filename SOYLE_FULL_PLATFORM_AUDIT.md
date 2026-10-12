# Soyle — полный аудит существующей платформы перед развитием функциональности

Дата аудита: 12 октября 2026 года  
Объект: локальный репозиторий /Users/whynicky/Desktop/Projects/Soyle  
Режим: только чтение и безопасные локальные проверки; продуктовый код, БД и production не изменялись.

## Методика и шкала статусов

Аудит основан прежде всего на фактическом коде, схеме БД, тестах и ручной проверке интерфейса. README и локальные документы использовались только для сопоставления с реализацией. Они не считались доказательством работоспособности.

- **IMPLEMENTED** — функция реализована и её основной путь подтверждён кодом и/или локальной проверкой.
- **PARTIAL** — полезная часть работает, но обещанный сценарий, охват, безопасность, UX или интеграция неполны.
- **BROKEN** — код функции существует, но текущий пользовательский путь недоступен, противоречив или не может выполнить заявленную задачу.
- **NOT_IMPLEMENTED** — пользовательского сценария или исполнимой реализации не найдено.
- **UNVERIFIED** — реализация существует, но её работоспособность нельзя подтвердить в доступной среде.
- **UNKNOWN** — данных недостаточно даже для уверенной статической оценки.

Под словом «прогресс» в этом документе подразумевается только то, что реально вычисляет Soyle: охват доступных цифровых заданий, результаты игровых выборов и описательные показатели участия. Это не клиническая динамика речи.

## 1. Executive Summary

Soyle сейчас — технически работоспособный русскоязычный MVP для домашней практики и поддерживаемой коммуникации. В нём есть отдельные входы родителя и ребёнка, три игровые механики, свободная AAC-доска, кабинет родителя, AI-подсказки, базовый прогресс и админ-панель. Архитектура компактна и понятна, защита cookie-сессии, CSRF, семейной изоляции и добровольных согласий заметно лучше типичного демонстрационного MVP.

Однако продукт пока не соответствует всей целевой концепции и не готов к внешнему пилоту с детьми и реальными персональными данными. Главные причины:

1. Нет действующей роли логопеда и рабочего кабинета специалиста. Сохранившийся backend-код специалиста скрыт и недостижим.
2. Нет стартовой оценки навыков, речевого профиля, индивидуальных целей и настоящего алгоритма адаптации. Локальный план одинаков для пользователей; AI использует только возраст и грубую 14-дневную сводку.
3. Из 35 встроенных упражнений активно 19: 6 моторных, 3 слуховых выбора и 10 учебных AAC-сценариев. Остальные 16 архивированы из-за отсутствия подходящей механики или контента.
4. Моторные упражнения реально активны и доступны семье, хотя README и пользовательское соглашение утверждают обратное. Это подтверждённое продуктовое, юридическое и безопасностное противоречие.
5. Казахский язык отсутствует в текущем пользовательском продукте. Реализован только русский; остаточные типы и шаблоны KK/EN не образуют локализованный продукт.
6. Согласия полезны, но не покрывают весь жизненный цикл детских данных: профиль ребёнка создаётся и хранится до принятия основного согласия, а значение «аналитики» не совпадает со всеми фактическими способами использования истории.
7. Технический «конструктор упражнений» администратора не является настоящим конструктором: новые произвольные цели не получают механику или стимулы и могут оказаться невыполнимыми.
8. Нет доказательств клинической эффективности, методического одобрения активных упражнений, юридической готовности, production smoke-теста, проверки PostgreSQL-миграций, реальных устройств и ассистивных технологий.

Количественная картина:

| Показатель | Результат |
|---|---:|
| Отслеживаемые Git-файлы | 192 |
| Проаудированные продуктовые возможности | 68 |
| IMPLEMENTED / PARTIAL / BROKEN / NOT_IMPLEMENTED / UNVERIFIED | 25 / 26 / 6 / 9 / 2 |
| HTTP endpoints | 60: 47 текущих и 13 скрытых legacy |
| Таблицы БД | 21 |
| Seed-упражнения | 35: 19 активных и 16 архивных |
| Исполнимые игровые механики | 3 |
| Базовые AAC-карточки | 63 |
| Автоматические тесты, реально запущенные | 31: 20 backend + 11 frontend |

Итоговый статус продукта: **сильный технический MVP для внутреннего контролируемого прогона на тестовых данных; NO-GO для внешнего пилота с детьми до методической, юридической, privacy, accessibility и production-проверки**.

## 2. Technology Stack

### 2.1 Frontend

| Технология | Зафиксированная версия | Роль |
|---|---:|---|
| Next.js | 16.3.8 | App Router, страницы, security headers, dev/build |
| React / React DOM | 19.3.0 | Клиентский интерфейс |
| TypeScript | 5.9.3 | Типы frontend |
| @mediapipe/tasks-vision | 1.1.0 | Локальный FaceLandmarker для моторных заданий |
| lucide-react | 0.468.0 | Иконки |
| ESLint / eslint-config-next | 9.39.5 / 16.4.0 | Статический анализ |
| Web Speech API | API браузера | Резервная озвучка |
| Service Worker / Cache API | API браузера | Ограниченный shell-cache |

Манифест зависимостей: frontend/package.json и frontend/package-lock.json. Локально использовались Node.js 26.0.0 и npm 11.12.1. package.json заявляет совместимые диапазоны, а не строгие версии. npm ls показывает два extraneous-пакета WebAssembly/Sharp, которых нет в package.json; это не доказанный дефект, но признак неидеальной чистоты установки.

### 2.2 Backend

| Технология | Установленная версия | Заявленный диапазон | Роль |
|---|---:|---:|---|
| Python | 3.12.13 | README: 3.11+ | Runtime |
| FastAPI | 0.142.2 | >=0.115,<1.0 | HTTP API |
| Uvicorn | 0.54.0 | >=0.34,<1.0 | Локальный ASGI |
| Pydantic | 2.13.5 | >=2.10,<3.0 | Валидация |
| PyJWT | 2.15.1 | >=2.10,<3.0 | JWT |
| pwdlib | 0.3.1 | >=0.2,<1.0 | Argon2 password hashing |
| psycopg | 3.3.6 | >=3.2,<4.0 | PostgreSQL |
| OpenAI Python SDK | 2.54.0 | >=2.0,<3.0 | Responses API |
| python-dotenv | 1.2.4 | >=1.0,<2.0 | Локальная загрузка AI-переменных |
| pytest | 9.1.1 | >=9.0.3,<10.0 | Backend-тесты |
| httpx2 | 2.13.1 | >=2.0,<3.0 | TestClient transport |

Зависимости: backend/requirements.txt и backend/requirements-dev.txt. Команда pip check не обнаружила конфликтов.

### 2.3 Данные, AI, медиа и деплой

- Локальная БД: SQLite через стандартный sqlite3.
- Production-путь: PostgreSQL через psycopg и DATABASE_URL.
- ORM отсутствует; используются ручные SQL-запросы.
- Миграционный фреймворк отсутствует; init_db в backend/app/database.py создаёт таблицы и выполняет ALTER TABLE при старте.
- AI: OpenAI Responses API; модель по умолчанию gpt-4o-mini, настраивается SOYLE_OPENAI_MODEL.
- TTS: системная команда say + ffmpeg на поддерживаемом macOS либо Web Speech API в браузере. Аудио ребёнка не записывается.
- Computer vision: MediaPipe FaceLandmarker, модель и WASM лежат в frontend/public/mediapipe. Общий объём public около 49 МБ; две WASM-сборки примерно по 12 МБ и модель около 4,1 МБ.
- Изображения: локальные статические файлы в frontend/public; 63 AAC-пиктограммы и иллюстрации.
- Предзаписанное аудио: 34 MP3 в frontend/public/audio, но текущий код приложения их не использует.
- Деплой: два Vercel-проекта — frontend Next.js и backend FastAPI. Точки входа: frontend/next.config.ts, backend/vercel.json и backend/api/index.py.
- Локальный запуск: start.sh запускает отдельные процессы frontend и backend и принудительно использует локальную SQLite.

## 3. Architecture

### 3.1 Карта компонентов

~~~text
Пользовательский браузер
├─ Next.js / React
│  ├─ публичные страницы: /, /privacy, /terms
│  ├─ единое client-side приложение: /app
│  ├─ локальный Web Speech API
│  ├─ локальный MediaPipe + камера
│  └─ service worker для публичного shell
│
└─ HTTPS/JSON + cookie + CSRF
   └─ FastAPI
      ├─ auth / roles / rate limit
      ├─ дети, согласия, настройки
      ├─ упражнения, сессии, прогресс
      ├─ AAC и грамматика
      ├─ AI plan / parent assistant
      ├─ admin / usage / audit
      ├─ системный TTS при наличии
      └─ SQLite локально или PostgreSQL в production
         └─ 21 таблица, ручные SQL и startup-DDL

Внешний сервис:
FastAPI ── только после AI consent ──> OpenAI Responses API
~~~

### 3.2 Frontend-архитектура

- Четыре файловых маршрута: frontend/app/page.tsx, frontend/app/app/page.tsx, frontend/app/privacy/page.tsx, frontend/app/terms/page.tsx.
- Почти весь авторизованный продукт находится в одном client component frontend/components/SoyleApp.tsx объёмом около 1 883 строк.
- Внутренние экраны переключаются состоянием Screen, а не URL-маршрутами. Это упрощает MVP, но исключает deep links, browser history и разделение bundle по экранам.
- Основные функции: AuthScreen, AuthenticatedApp, HomeScreen, SessionScreen, GamesScreen, LearningPath, ExerciseLibrary, MotorGame, SensoryGame, PhraseGame, ProgressScreen, AIParentScreen, ParentScreen, AdminScreen, ProfileScreen и SettingsScreen.
- API-клиент сосредоточен в frontend/lib/api.ts: credentials include, CSRF-header, 8-секундный timeout и унифицированные ошибки.
- Отдельные библиотеки: aacGrammar.ts, motorDetection.ts и i18n.ts.
- Глобальные стили сосредоточены в frontend/app/globals.css объёмом около 791 строки; лендинг имеет frontend/app/landing.css.

### 3.3 Backend-архитектура

- backend/app/main.py — монолитный FastAPI-модуль примерно на 1 652 строки с middleware, бизнес-логикой, SQL и всеми 60 endpoints.
- backend/app/database.py — подключение SQLite/PostgreSQL, DDL, startup-изменения схемы и seed-контент.
- backend/app/schemas.py — 28 Pydantic-моделей.
- backend/app/security.py — JWT, cookie, CSRF-связка, Argon2 и role dependencies.
- backend/app/ai_assistant.py — OpenAI-клиент, системные инструкции и строгие JSON schemas.
- backend/app/aac_grammar.py — разрешённые языковые шаблоны AAC.
- Сервисного и repository-слоя нет; endpoints напрямую обращаются к БД. Для текущего объёма это читаемо, но увеличивает связанность и стоимость изменений.

### 3.4 Основные потоки

1. Регистрация родителя создаёт users-запись и cookie-сессию.
2. ChildOnboarding создаёт children-запись до принятия consent.
3. Родитель создаёт student_accounts с отдельным логином/PIN.
4. /app загружает /api/auth/me, детей, настройки, упражнения, consent, активную learning_session и dashboard.
5. План 3/5/10 минут формируется локально или OpenAI, затем сохраняется в learning_sessions.
6. Результаты отдельных активностей записываются в sessions; server-side код пересчитывает score.
7. Dashboard и progress агрегируют sessions относительно активного каталога упражнений.
8. AAC-карточки загружаются из aac_cards; favorites хранятся по ребёнку, guided phrases могут попадать в aac_phrase_history.

## 4. Roles and Permissions

| Роль | Фактическая авторизация | Доступ | Ограничения и вывод |
|---|---|---|---|
| Parent | users.role=parent, пароль, 24-часовой JWT-cookie | Свои дети, настройки, игры, AAC, AI, прогресс, consent, student account, export/delete | Основная полноценная роль. Нет редактирования профиля ребёнка, управления экранным временем или текущего специалиста. |
| Student | student_accounts, цифровой PIN, 12-часовой JWT-cookie | Только связанный child_id, домашний экран, занятия, AAC, настройки | Серверная изоляция подтверждена тестом. Может запускать AI-план после родительского AI consent и тем самым создавать AI-расход. |
| Admin | users.role=admin, пароль | Статистика, взрослые пользователи, ученические аккаунты, упражнения, AI usage, audit | Не получает специалистский UI. API /api/children возвращает администратору всех детей, хотя текущей admin UI это не требуется. |
| Specialist | Значение допустимо в DB CHECK и legacy endpoints | Теоретически goals, homework, assignments, recommendations | **BROKEN**: schema регистрации/смены роли не допускает specialist; startup деактивирует таких users; get_current_user явно отвергает роль; endpoints скрыты из OpenAPI; UI отсутствует. |

Ключевой latent-risk: ensure_child_access проверяет parent и student, но не проверяет specialist_children для роли specialist. Если роль специалиста просто повторно включить, legacy specialist endpoints смогут обращаться к произвольному child_id без проверки назначения и действующего specialist-sharing consent. Поэтому восстановление роли нельзя делать простым удалением блокировки.

Матрица чувствительных действий:

| Действие | Parent | Student | Admin | Specialist сейчас |
|---|---:|---:|---:|---:|
| Просмотр своего ребёнка | Да | Да, только один | Да, всех | Нет входа |
| Создание ребёнка | Да | Нет | Нет | Нет |
| Изменение consent | Да | Нет | Нет | Нет |
| Просмотр consent | Да | Да | Нет отдельного UI | Нет |
| Создание custom AAC | Да | Нет | Нет | Нет |
| Игры/AAC | Да | Да | Не в UI | Нет |
| AI-вопрос родителя | Да | Нет | Нет | Нет |
| AI-план | Да | Да при consent | Технически child access глобален | Нет |
| Export/delete ребёнка | Да, только свой; delete с паролем | Нет | Нет | Нет |
| Управление взрослыми ролями | Нет | Нет | Да: parent/admin | Нет |
| Exercise management | Нет | Нет | Да, кроме полноценного контента | Нет |

## 5. Complete Feature Inventory

Всего оценено 68 продуктовых возможностей: 25 IMPLEMENTED, 26 PARTIAL, 6 BROKEN, 9 NOT_IMPLEMENTED и 2 UNVERIFIED.

| № | Возможность и текущее назначение | Frontend | API / данные | Статус | Ограничение или следующий вопрос |
|---:|---|---|---|---|---|
| 1 | Публичный лендинг с позиционированием и FAQ | LandingPage.tsx, landing.css | Нет | IMPLEMENTED | Только русский; заявления нужно синхронизировать с фактическим каталогом. |
| 2 | Privacy page | app/privacy/page.tsx | Нет | PARTIAL | Технический черновик; нет утверждённого оператора, retention, subprocessors, incident flow. |
| 3 | Terms page | app/terms/page.tsx | Нет | PARTIAL | Прямо утверждает, что моторных упражнений нет, хотя они активны. |
| 4 | Регистрация родителя | AuthScreen | POST /api/auth/register; users | IMPLEMENTED | Нет email verification; email фактически синтетический. |
| 5 | Вход parent/admin | AuthScreen | POST /api/auth/login | IMPLEMENTED | Нет recovery/MFA; локальная проверка пройдена. |
| 6 | Вход ребёнка по PIN | AuthScreen | POST /api/auth/student-login; student_accounts | IMPLEMENTED | PIN 4–12 цифр; нет UI ротации/отзыва кроме перезаписи. |
| 7 | Cookie session, me и logout | AuthenticatedApp, api.ts | GET /api/auth/me; POST /api/auth/logout | IMPLEMENTED | Нет списка устройств и server-side session revocation. |
| 8 | CSRF и Origin protection | api.ts | browser_security middleware | IMPLEMENTED | Bearer bypass допустим для API; production bearer не выдаётся UI. |
| 9 | Ограничение попыток входа | Нет отдельного UI | auth_attempts | IMPLEMENTED | Нет распределённого store/операционного мониторинга. |
| 10 | Восстановление пароля/PIN | Нет | Нет | NOT_IMPLEMENTED | Критично определить безопасную процедуру оператора. |
| 11 | MFA и управление активными сессиями | Нет | Нет | NOT_IMPLEMENTED | Особенно актуально для parent/admin. |
| 12 | Создание профиля ребёнка | ChildOnboarding | POST /api/children; children | IMPLEMENTED | Создаётся до принятия основного privacy consent. |
| 13 | Несколько детей и выбор профиля | ParentScreen | GET /api/children | PARTIAL | Выбор есть; после первого onboarding нет видимой кнопки добавить ребёнка. |
| 14 | Редактирование профиля ребёнка | Нет | Нет PATCH child | NOT_IMPLEMENTED | Имя, дата рождения, primary_module и цвет неизменяемы. |
| 15 | Ученический аккаунт | ParentScreen | GET/POST student-account | PARTIAL | Создание/смена логина и PIN есть; нет disable/delete UI/API. |
| 16 | Профиль аккаунта | ProfileScreen | Данные me/dashboard | PARTIAL | В основном просмотр; взрослое имя/пароль не редактируются. |
| 17 | Настройки | SettingsScreen | GET/PUT /api/settings; user_settings | IMPLEMENTED | Сохраняются отдельно для user/student. |
| 18 | Темы, high contrast, calm/reduced motion | SettingsScreen, globals.css | user_settings | IMPLEMENTED | Контраст не измерен документированно; calm не снижает плотность контента. |
| 19 | Уведомления о завершении модулей | Topbar panel | GET/PATCH notifications | PARTIAL | Только parent и только module-complete; нет push/email. |
| 20 | Управление камерой/звуком | Settings + consent | settings, child_consents | PARTIAL | camera_enabled есть в settings, но MotorGame фактически использует consent, а не setting. |
| 21 | Главный детский экран и выбор 3/5/10 минут | HomeScreen | dashboard, AI plan | IMPLEMENTED | Цель 3 задания и streak могут создавать давление. |
| 22 | Пошаговый учебный путь | LearningPath | exercises, dashboard | PARTIAL | Все шесть units разблокированы; линейность только внутри unit; это не индивидуальная программа. |
| 23 | Поиск/фильтр библиотеки | ExerciseLibrary | GET /api/exercises | IMPLEMENTED | Библиотека скрыта в student-режиме, доступна взрослому. |
| 24 | Безопасный локальный план | Home/Session | GET /api/session-plan | PARTIAL | Одинаковая сортировка по difficulty/id; history и primary_module не влияют. |
| 25 | AI-план | Home/Session | POST /api/ai/plan | PARTIAL | Ограничен allowlist, но персонализация минимальна; student может инициировать расход. |
| 26 | Сохранённая learning session и resume | SessionScreen | POST/GET learning-sessions, active-session | IMPLEMENTED | Нет DB unique constraint от конкурентного двойного создания. |
| 27 | Пауза/возврат/завершение занятия | SessionScreen | PATCH pause; sessions | IMPLEMENTED | Break внутри упражнения не всегда продвигает plan, что соответствует паузе. |
| 28 | Покрытие программы и module completion | ProgressScreen | dashboard/progress | PARTIAL | Покрытие активных ID, не освоение навыка; archived content меняет знаменатель. |
| 29 | Подсказки, самостоятельность, response time, инициативы | Parent/progress | sessions, support_metrics | PARTIAL | Часть полей заполняется эвристически; response_ms UI почти не заполняет. |
| 30 | Stars, badges, daily goal, streak | Home/Progress | агрегаты dashboard | PARTIAL | Полезная мотивация, но streak и «3 из 3» требуют проверки на стресс. |
| 31 | Моторная практика перед камерой | MotorGame, motorDetection.ts | POST sessions; consent | PARTIAL | Технически работает локально; без камеры завершить нельзя; клинически не валидировано; документы противоречат. |
| 32 | Слуховой выбор картинки | SensoryGame | POST /api/tts, POST sessions | PARTIAL | 3 активные темы; 5 раундов; score — игровой выбор, не понимание речи в целом. |
| 33 | Учебные AAC-сценарии | PhraseGame guided | compose/history/sessions | PARTIAL | 10 сценариев; большинство засчитывает любую ожидаемую карточку, а не полноценную фразу. |
| 34 | Свободная AAC-доска | PhraseGame freeMode | GET cards, POST compose | IMPLEMENTED | Доступна отдельно, не оценивается, есть быстрые сообщения. |
| 35 | Озвучка AAC | PhraseGame + speak | POST /api/tts / Web Speech | PARTIAL | Нет выбора голоса; качество/произношение не проверено на целевых устройствах. |
| 36 | AAC favorites | PhraseGame | PATCH favorite; aac_favorites | IMPLEMENTED | Требует privacy consent. |
| 37 | Персональная AAC-карточка | PhraseGame form | POST /api/aac/cards | PARTIAL | Только label/speech/category; без фото, upload, edit/delete, выбора роли/голоса. |
| 38 | История свободной AAC | В UI есть блок recent | GET/POST aac/history | BROKEN | freeMode намеренно не загружает и не сохраняет history; история работает лишь в guided режиме. |
| 39 | Отказ и перерыв | Motor и guided AAC | sessions attempt_status | PARTIAL | Есть в motor/guided AAC; нет явной кнопки «не хочу/перерыв» в sensory. |
| 40 | Самостоятельный детский поток | student mobile UI | student APIs | PARTIAL | Нижняя навигация удачна, но много взрослого текста, dense course и зависимость sensory от звука. |
| 41 | Кабинет родителя | ParentScreen | dashboard/consent/account | IMPLEMENTED | Центр управления есть и визуально связный. |
| 42 | История игровых попыток | ParentScreen | dashboard recent | IMPLEMENTED | Показывает последние записи; не профессиональная временная аналитика. |
| 43 | Памятка взрослому и stop criteria | ParentScreen | Статический контент | IMPLEMENTED | Хорошая безопасная копия; методическое утверждение всё ещё нужно. |
| 44 | Granular consent | ParentScreen | GET/PUT consent; child_consents | PARTIAL | Opt-in и отзыв есть; профиль до consent, specialist field скрыт, semantics analytics неполны. |
| 45 | Экспорт данных ребёнка | ParentScreen | GET child export | IMPLEMENTED | JSON собирается в браузере; backup/retention removal не подтверждены. |
| 46 | Удаление ребёнка | ParentScreen | DELETE child + пароль | IMPLEMENTED | Основные child-FK каскадируют; удаление из backup не определено. |
| 47 | AI-помощник родителя | AIParentScreen | POST /api/ai/ask | PARTIAL | Есть consent, label и fallback; нет PII-redaction, источников, feedback и semantic medical guard. |
| 48 | Домашние задания | Нет текущего UI | hidden homework endpoints; homework_assignments | BROKEN | Таблица/API/tests есть, но specialist недоступен и endpoints скрыты. |
| 49 | Рекомендации специалиста родителю | Нет текущего UI | hidden specialist_recommendations | BROKEN | Нельзя создать через действующую роль. |
| 50 | Screen-time controls | Нет | Нет | NOT_IMPLEMENTED | Есть выбор длительности, но нет лимита/расписания/parent lock. |
| 51 | Вход и роль специалиста | Нет | legacy role checks | BROKEN | Роль деактивируется и отклоняется auth. |
| 52 | Кабинет логопеда | Нет | Нет текущего API surface | NOT_IMPLEMENTED | Целевая часть платформы отсутствует. |
| 53 | Назначения, goals, homework, recommendations | Нет | 13 hidden legacy endpoints | BROKEN | Структура присутствует, но недостижима и имеет latent authorization flaw. |
| 54 | Профессиональный отчёт | Нет | support_metrics можно было бы переиспользовать | NOT_IMPLEMENTED | Нет рабочего specialist access/export/report. |
| 55 | Admin stats | AdminScreen | GET /api/admin/stats | IMPLEMENTED | Базовые counts; status badge UI статический. |
| 56 | Управление взрослыми users | AdminScreen | users role/active | IMPLEMENTED | Только parent/admin; можно лишить систему последнего admin, safeguard нет. |
| 57 | Список student accounts | AdminScreen | GET /api/admin/students | PARTIAL | Только просмотр; нет блокировки/ротации. |
| 58 | Exercise constructor | AdminScreen | POST/PUT/DELETE admin exercises | BROKEN | UI создаёт target=custom; механика/stimuli не создаются, mixed custom нельзя завершить. |
| 59 | OpenAI usage/cost | AdminScreen | GET /api/admin/usage; usage_events | IMPLEMENTED | Стоимость точна только для gpt-4o-mini; иные модели получают 0. |
| 60 | Audit log | AdminScreen | GET /api/admin/audit; audit_events | PARTIAL | Только отдельные critical actions; логины, exercise changes и ряд admin actions не покрыты. |
| 61 | Русская локализация | Все текущие экраны | language=ru | IMPLEMENTED | Фактический единственный поддержанный язык. |
| 62 | Казахская локализация | Переключателя нет | schemas фиксируют ru | NOT_IMPLEMENTED | Остаточные типы/grammar templates не являются продуктом. |
| 63 | Server/browser TTS | Sensory/PhraseGame | POST /api/tts | PARTIAL | Нет гарантированного server voice на Linux/Vercel; browser voice зависит от устройства. |
| 64 | ASR/оценка речи по аудио | Нет | Нет | NOT_IMPLEMENTED | Микрофон запрещён Permissions-Policy; это правильно отражено как отсутствие. |
| 65 | Photo/file upload | Нет | Нет | NOT_IMPLEMENTED | Пользовательские фото знакомых предметов отсутствуют; attack surface uploads также отсутствует. |
| 66 | Offline/service worker | Регистрация в app | public/sw.js | PARTIAL | Кэшируется shell, не API/AAC/MediaPipe; нет manifest, sync UI или достоверного offline-режима. |
| 67 | Production deployment | Vercel config | frontend/backend projects | UNVERIFIED | Production URL, headers, cookie domain, PostgreSQL, OpenAI и smoke не проверялись. |
| 68 | Клиническая эффективность и пригодность при алалии | Нет доказательств | Не кодовая функция | UNVERIFIED | Нужна независимая профессиональная и пользовательская валидация; техническая работа не равна эффективности. |

## 6. Child Experience

### 6.1 Вход и навигация

Ребёнок входит через вкладку «Ребёнок» по логину и цифровому PIN. В student-режиме на телефоне доступна фиксированная нижняя навигация из четырёх разделов: «Главная», «Занятия», «Сказать», «Настройки». Родительский кабинет, AI-вопросы и аналитический экран прогресса в навигации отсутствуют. Сервер ограничивает student одним child_id.

Плюсы:

- Отдельный вход без email.
- Четыре постоянных пункта на мобильном экране.
- Большие основные карточки и сохранение выбранной темы/звука.
- Свободная AAC вынесена в самостоятельный пункт «Сказать».

Ограничения:

- PIN может быть всего из четырёх цифр.
- Ребёнок видит adult-oriented формулировки в каталоге: «Начните...», «Подсказка для взрослых».
- Каталог показывает сразу шесть курсов и много текстовых описаний; это тяжело для ребёнка с выраженными трудностями понимания речи.
- Экран профиля технически можно открыть через avatar на некоторых компоновках, хотя он не входит в детскую навигацию.

### 6.2 Главный экран

HomeScreen показывает приветствие, выбор 3/5/10 минут, большую кнопку старта, цель «3 задания», streak, weekly dots и три направления: motor, sensory и mixed. При отсутствии consent задания можно просматривать, но результаты не сохраняются. Кнопка старта не всегда визуально disabled заранее; ошибка показывается после попытки.

Локальная и AI-сессия содержат 2, 3 или 5 полноценных активностей. Перед началом каждого шага SessionScreen показывает «сейчас/затем», оставшееся время и позволяет сделать паузу. Незавершённая сессия восстанавливается после reload/login.

### 6.3 Давление и стресс

Положительные элементы:

- Нет таймера на ответ в sensory и AAC.
- Ошибка сопровождается спокойной нейтральной копией, без негативного звука.
- Отказ в guided AAC и motor принимается как сообщение, не как ошибка.
- Повтор аудио не ограничен.
- Session можно поставить на паузу.
- Есть calm mode и prefers-reduced-motion.

Риски:

- Ежедневная цель «3 из 3», streak, stars и полноэкранное празднование создают внешнюю мотивацию и могут восприниматься как обязательство.
- Sensory не имеет видимой кнопки «Перерыв/Не хочу»; выход стрелкой не сохраняет отказ и может быть непонятен как право остановиться.
- Motor даёт только 10 секунд на автоматическое обнаружение после калибровки; это может провоцировать повторение и фрустрацию.
- Фраза «Движение пока не найдено / попытка не засчитана» может восприниматься как оценка ребёнка, несмотря на disclaimer.
- Нет настройки количества вариантов, размера AAC-карточек, громкости и плотности информации.

### 6.4 Самостоятельность

- Free AAC и базовая student-навигация подходят для самостоятельного использования лучше других областей.
- Sensory требует работоспособного звука, понимания демонстрации и выбора картинки; при ошибках система постепенно помогает.
- Guided AAC позволяет ребёнку выбрать одну карточку и озвучить сообщение, но взрослый нужен для достоверной отметки уровня подсказки. В student-режиме prompt level по умолчанию independent, поэтому метрика может завышать самостоятельность.
- Motor требует отдельного parent consent, browser camera permission, позиционирования лица и распознавания движения; большинству детей понадобится взрослый.

## 7. Existing Exercises

### 7.1 Полный каталог seed-контента

В database.py определено 35 упражнений. init_db принудительно архивирует 9 неподдержанных sensory целей и 7 mixed целей без отдельного сценария. Все 6 motor целей остаются активными. Фактический активный каталог: 19.

| Модуль | Название | target | Сложность | Текущий статус | Фактическая механика |
|---|---|---|---:|---|---|
| motor | Широкая улыбка | smile | 1 | ACTIVE / PARTIAL | MediaPipe: улыбка относительно baseline |
| motor | Губы трубочкой | tube | 1 | ACTIVE / PARTIAL | mouthPucker/mouthFunnel |
| motor | Окошко | open | 2 | ACTIVE / PARTIAL | jawOpen |
| motor | Заборчик | teeth | 2 | ACTIVE / PARTIAL | Эвристика улыбки/upper lip; зубы напрямую не определяются |
| motor | Воздушный шар | cheeks | 3 | ACTIVE / PARTIAL | cheekPuff |
| motor | Чередование | sequence | 3 | ACTIVE / PARTIAL | Сначала smile, затем tube |
| sensory | Домашние животные | animals | 1 | ACTIVE / PARTIAL | 8 стимулов; 3 картинки; 5 раундов |
| sensory | Еда и напитки | food | 1 | ACTIVE / PARTIAL | 8 стимулов; 3 картинки; 5 раундов |
| sensory | Игрушки | toys | 1 | ACTIVE / PARTIAL | 8 стимулов; 3 картинки; 5 раундов |
| sensory | Части тела | body | 1 | ARCHIVED | Данные из 3 иконок есть, user flow скрыт |
| sensory | Одежда | clothes | 1 | ARCHIVED | Данные есть, user flow скрыт |
| sensory | Предметы дома | household | 1 | ARCHIVED | Данные есть, user flow скрыт |
| sensory | Действия | actions | 2 | ARCHIVED | Статичные иконки не подтверждают понимание действия |
| sensory | Признаки предметов | qualities | 2 | ARCHIVED | Неполная/неоднозначная mechanic |
| sensory | Где находится предмет | location | 2 | ARCHIVED | Нет контролируемых сопоставимых изображений |
| sensory | Места вокруг нас | places | 2 | ARCHIVED | Неполный content set |
| sensory | Противоположности | opposites | 2 | ARCHIVED | Нет корректной парной mechanic |
| sensory | Инструкции из двух шагов | commands | 3 | ARCHIVED | Выбор одной иконки не является выполнением инструкции |
| mixed | Я хочу | request | 1 | ACTIVE / PARTIAL | Любая ожидаемая карточка засчитывает просьбу |
| mixed | Я вижу | observation | 1 | ACTIVE / PARTIAL | Любая из actor/action cards; фраза не обязательна |
| mixed | Мне нравится | preference | 2 | ARCHIVED | Своя учебная ситуация отсутствует |
| mixed | Моя семья | family | 2 | ARCHIVED | Своя учебная ситуация отсутствует |
| mixed | Как я себя чувствую | feelings | 2 | ACTIVE / PARTIAL | Любая из 7 state cards |
| mixed | Мой день | routine | 3 | ACTIVE / PARTIAL | Одно действие уже завершает «последовательность» |
| mixed | Попросить помощь | help | 1 | ACTIVE / IMPLEMENTED technical | Одна карточка «Помоги» |
| mixed | Сказать о желании | desire | 1 | ARCHIVED | Дублирует free AAC/request |
| mixed | Сообщить о необходимости | need | 1 | ARCHIVED | Отдельного scenario нет |
| mixed | Сказать «нет» | refusal | 1 | ACTIVE / IMPLEMENTED technical | «Нет» или «Не хочу» |
| mixed | Сделать выбор | choice | 1 | ACTIVE / IMPLEMENTED technical | «Сок» или «Вода» |
| mixed | Поздороваться | greeting | 1 | ARCHIVED | Отдельного scenario нет |
| mixed | Ответить «да» или «нет» | answer | 1 | ACTIVE / IMPLEMENTED technical | Оба ответа принимаются |
| mixed | Кто и что делает | agent_action | 2 | ARCHIVED | Отдельного scenario нет |
| mixed | Где находится предмет | spatial_phrase | 2 | ARCHIVED | Отдельного scenario нет |
| mixed | Спросить о предмете | question | 2 | ACTIVE / PARTIAL | Готовая карточка «Что это?» или «Где?» |
| mixed | Рассказать о событии | past_event | 3 | ACTIVE / PARTIAL | «Играл» или «Гулял» достаточно |

### 7.2 Механика motor

Файлы: MotorGame и MouthGuide в frontend/components/SoyleApp.tsx, frontend/lib/motorDetection.ts, модель frontend/public/mediapipe/models/face_landmarker.task.

- Что видит ребёнок: камера, рамка лица, схематический образец и инструкция.
- Что слышит: отдельной обязательной инструкции TTS нет.
- Действие: 3 секунды нейтрального baseline, затем до 10 секунд показать движение.
- Проверка: FaceLandmarker каждые примерно 120 мс выдаёт blendshapes. Нужны 6 последовательных совпадений по absolute и delta threshold. Для sequence нужны smile, затем tube.
- Ошибка: «не найдено», возможность повторить; score не начисляется.
- Подсказки: визуальный образец и live confidence; отдельной градации автоматических подсказок нет.
- Пропуск: «Перерыв» и «Не хочу» доступны; смена движения не равна завершению.
- Сложность: только метаданные 1–3; thresholds фиксированы для всех детей.
- Сохранение: только после локально detected movement и camera consent; сервер получает итог и признаки, не кадры. attempt_status принудительно participated, score=0, одна star.
- После завершения: взрослый отмечает «Самостоятельно» или «С помощью».
- Без взрослого: технически возможно после выдачи consent/permission, практически может понадобиться помощь.
- Предполагаемый навык: движение перед зеркалом; нельзя делать вывод об артикуляции, речи или коррекционной пользе.
- Ограничения: нет клинической калибровки, child-specific baseline только на одну попытку, teeth определяется косвенно, camera-only completion, fixed deadline.

Вердикт: **PARTIAL технически; UNVERIFIED клинически**.

### 7.3 Механика sensory

Файл: SensoryGame и sensorySets в frontend/components/SoyleApp.tsx.

- Что видит: короткую демонстрацию, затем 3 неподписанные картинки; подписи появляются только после разрешения раунда.
- Что слышит: target word через server TTS либо browser speech; можно повторить и выбрать скорость 0,65 / 0,78 / 1,0.
- Действие: выбрать изображение услышанного слова.
- Правильность: индекс выбора сравнивается с target.
- После первой ошибки: повтор аудио.
- После второй ошибки: выбор сокращается до двух.
- После третьей: правильный ответ показывается и озвучивается.
- Повторные попытки: до трёх на раунд; 5 раундов.
- Пропуск: отдельной кнопки refusal/break нет; back выходит без записи.
- Сложность: не адаптируется между sessions; active темы всегда используют 3 варианта и 5 раундов.
- Сохранение: attempts_count=5 означает раунды, correct_answers — раунды, найденные до показа модели; реальное количество taps отдельно не хранится.
- Score: correct_answers/5, рассчитанный сервером. Independence — доля first-try rounds.
- После завершения: спокойный экран completion и следующий activity.
- Без взрослого: возможно при рабочем звуке и понятой демонстрации.
- Навык: игровой auditory-word-to-picture matching; не доказательство общего понимания речи.
- Ограничения: только существительные в 3 темах; нет generalization, новых фотографий, интервального повторения и переноса в быт.

Вердикт: **PARTIAL**.

### 7.4 Механика guided AAC

Файлы: PhraseGame, aacScenarios и isAACScenarioSuccess в SoyleApp.tsx; aacGrammar.ts и backend/app/aac_grammar.py.

- Что видит: ситуацию, критерий, ограниченный набор карточек и всегда доступные safety cards «Помоги/Перерыв/Не хочу» при необходимости.
- Что слышит: выбранная одиночная карточка или допустимая композиция озвучивается.
- Действие: выбрать до 8 карточек и нажать «Озвучить сообщение».
- Правильность: это participation, не score. Сценарий завершается, если присутствует любая ожидаемая карточка.
- Ошибка: грамматически неподдержанная последовательность не озвучивается как готовая фраза; UI объясняет причину.
- Повторы: не ограничены; карточки можно удалять из строки.
- Подсказки: parent выбирает independent/minimal/full; student всегда начинает с independent.
- Пропуск: «Перерыв» сохраняется как break; «Не хочу» вне refusal — refused.
- Сложность: фиксирована набором scenario labels; difficulty не меняет механику.
- Сохранение: guided phrase сохраняется в AAC history только при analytics consent; результат занятия — participated/refused/break.
- После завершения: completion screen и переход к следующему activity.
- Без взрослого: коммуникация возможна; достоверная оценка prompt level без наблюдателя ограничена.
- Навык: функциональная коммуникация, выбор, запрос, отказ, состояние, короткий комментарий.
- Ограничения: цель, обещающая sequence/event/phrase, часто завершается одной карточкой; нет проверки переноса или истинности сообщения, что этически правильно, но методически ограничивает упражнение.

Вердикт: **PARTIAL**, при этом отказ/help/yes-no технически реализованы удачно.

### 7.5 Покрытие 18 требуемых педагогических категорий

| Категория | Статус | Что реально есть |
|---|---|---|
| 1. Понимание названий предметов | PARTIAL | animals, food, toys: 24 стимула, выбор 1 из 3 |
| 2. Понимание действий | NOT_IMPLEMENTED | actions есть только в архивном наборе статичных иконок |
| 3. Понимание простых инструкций | NOT_IMPLEMENTED | Нет mechanic выполнения инструкции |
| 4. Понимание сложных инструкций | NOT_IMPLEMENTED | commands archived; двухшаговое действие не проверяется |
| 5. Сопоставление изображений | PARTIAL | Есть сопоставление услышанного слова с изображением, не отдельный image matching |
| 6. Развитие словаря | PARTIAL | Повторяющиеся тематические существительные; нет proof of learning/generalization |
| 7. Выражение просьб | PARTIAL | request/help/choice через AAC; полноценная фраза не обязательна |
| 8. Звукоподражания | NOT_IMPLEMENTED | Не найдено |
| 9. Работа со слогами | NOT_IMPLEMENTED | Не найдено |
| 10. Произнесение слов | NOT_IMPLEMENTED | Нет microphone/ASR/записи; motor не является произнесением |
| 11. Построение словосочетаний | PARTIAL | AAC action+object или subject+action |
| 12. Построение предложений | PARTIAL | До трёх карточек по узким grammar templates |
| 13. Предлоги и пространственные отношения | NOT_IMPLEMENTED | Карточки и archived target есть, executable lesson нет |
| 14. Смысловые категории | PARTIAL | Категории AAC есть; отдельной обучающей mechanic классификации нет |
| 15. Последовательности событий | BROKEN/PARTIAL | routine обещает sequence, но принимает одну action card |
| 16. Простые истории | NOT_IMPLEMENTED | past_event — короткое сообщение, не narrative |
| 17. Коммуникативные сценарии | PARTIAL | 10 активных guided AAC situations |
| 18. Упражнения с участием родителей | PARTIAL | Prompt level и памятка есть; специальных совместных сценариев нет |

### 7.6 Клиническая граница

Ни одно активное упражнение нельзя считать эффективным для алалии только по наличию кода. Репозиторий не содержит:

- методических протоколов с авторами/версиями;
- критериев включения по профилю ребёнка;
- экспертной подписи на каждое упражнение;
- результатов usability/clinical pilot;
- валидированных outcome measures;
- доказательства, что игровые проценты коррелируют с речевыми навыками.

## 8. Learning and Adaptation Logic

### 8.1 Что собирается о ребёнке

Профиль содержит только name, birth_date, primary_module и avatar_color. Нет диагноза, уровня понимания, экспрессивной речи, способа коммуникации, моторных/сенсорных особенностей, языка семьи, AAC-профиля или contraindications. primary_module сохраняется, но не влияет на локальный или AI-план.

### 8.2 Формирование программы

Локальный session_plan:

1. Берёт все active non-motor exercises.
2. Для 3/5/10 минут выбирает 2/3/5 activity.
3. Сортирует по минимальному числу уже выбранных упражнений модуля, затем difficulty и id.
4. Не использует историю, score, подсказки, отказ, primary_module или цели.

Следовательно, на чистом состоянии пользователи получают практически одинаковый план.

AI plan:

- использует возраст в полных годах;
- агрегирует за 14 дней общее число attempts/refusals/breaks и число sensory/mixed attempts;
- отправляет до 40 разрешённых non-motor exercises;
- просит модель вернуть ровно target_count ID;
- отбрасывает неизвестные/повторные IDs и заполняет пропуски первым allowlisted контентом;
- не меняет базу программы, difficulty или упражнения;
- не использует имя и точную дату рождения.

Это ограниченная рекомендация порядка активностей, а не индивидуальная коррекционная программа.

### 8.3 Уровни и переходы

- difficulty 1–3 — metadata; алгоритм не повышает/понижает её по результатам.
- Все course units unlocked=true.
- Внутри каждого unit доступен первый незавершённый lesson; завершённые можно повторять.
- Отказ продвигает learning session, но не считается completed exercise для coverage.
- Break и technical_error не продвигают plan.
- Система не меняет число вариантов, speech rate, prompt hierarchy или интервал повторения на основе ошибок.

### 8.4 Расчёт результатов

- Только sensory со status completed формирует игровой score.
- Motor и guided AAC принудительно становятся participated и получают score=0.
- Refused, break, technical_error отделены от completed.
- Overall — доля уникальных active exercises с completed/participated.
- Module accuracy — среднее только по completed scored attempts.
- Stars — минимум 1 за completed, 1 за participated, 0 за refusal/break/technical.
- Streak учитывает completed, participated и refused.
- weakest_skill, recommended_exercise и progress_delta всегда None.

### 8.5 Функциональные пробелы адаптации

| Требование | Факт |
|---|---|
| Initial assessment | Нет |
| Диагноз в подборе | Нет, и не должен использоваться без методической модели |
| Возраст | Только AI prompt |
| Receptive vs expressive | Поля skill есть, полноценного профиля нет |
| Невербальная коммуникация | AAC поддерживается, но не профилируется |
| Реакция на частые ошибки | Только внутри одного sensory round |
| Закрепление / spaced repetition | Нет |
| Перенос в быт | Не проверяется; legacy homework недоступен |
| Ручное назначение специалистом | Legacy-код недоступен |
| Индивидуальные цели | Legacy goals недоступны |
| Возврат к старым заданиям | Да, через курс/библиотеку |

Вывод: **платформа пока выдаёт общий безопасный каталог и одинаковую последовательность с небольшой AI-перестановкой, а не адаптируется под реальный профиль конкретного ребёнка**.

## 9. Speech Therapist Dashboard

### 9.1 Текущее состояние

Действующего кабинета логопеда нет. Ни frontend role type, ни AuthScreen, ни navigation не содержат specialist. backend/app/schemas.py разрешает Role только admin и parent; backend/app/security.py отклоняет аутентифицированного user с role=specialist; init_db дополнительно выполняет UPDATE users SET is_active=0 WHERE role='specialist'.

### 9.2 Сохранившиеся legacy-заготовки

В БД и main.py остались:

- specialist_children — связь специалиста и ребёнка;
- assigned_exercises — назначенные упражнения;
- specialist_recommendations — рекомендации;
- child_goals — цели, критерий успеха, difficulty и exercise_ids;
- homework_assignments — домашние задания и ответ родителя;
- 13 endpoints с include_in_schema=False;
- support_metrics, пригодные как исходные данные для будущего немедицинского отчёта.

Это архитектурный задел, но не функция текущего продукта.

### 9.3 Матрица требуемых возможностей

| Возможность логопеда | Статус | Доказательство |
|---|---|---|
| Регистрация и вход | BROKEN | Роль не выдаётся и блокируется |
| Создание профиля ребёнка | NOT_IMPLEMENTED | Только parent создаёт child |
| Речевой профиль | NOT_IMPLEMENTED | В модели child нет функционального профиля |
| Назначение упражнений | BROKEN | Hidden POST assigned-exercises недостижим |
| Создание собственных упражнений | NOT_IMPLEMENTED для специалиста | Admin create не равно specialist authoring |
| Настройка сложности | BROKEN | Поле есть в legacy goal/admin API, workflow нет |
| Индивидуальная программа | NOT_IMPLEMENTED | Нет активного plan editor |
| Просмотр результатов/истории | BROKEN | legacy specialist_child недостижим |
| Просмотр ошибок/подсказок | BROKEN | support_metrics есть, UI нет |
| Работа с родителем | BROKEN | recommendations/homework недостижимы |
| Изменение целей | BROKEN | child_goals скрыты |
| Управление материалами | NOT_IMPLEMENTED | Нет media/content editor |
| Профессиональный export/report | NOT_IMPLEMENTED | Только семейный JSON export |

### 9.4 Безопасностное условие восстановления

Legacy endpoint specialist_child вызывает dashboard(child_id, user), а ensure_child_access не проверяет specialist_children и consent для специалиста. Assign/recommendation/goal/homework routes также не доказывают, что текущий специалист назначен именно этому ребёнку. До любого возврата роли нужны новая policy-модель, server-side assignment checks, действующее granular consent, аудит чтения и отзыв доступа. Простое включение role=specialist создаст горизонтальный доступ к данным детей.

## 10. Parent Dashboard

### 10.1 Что родитель видит и делает

- Переключает существующие child profiles.
- Видит возраст, coverage, today/week activity и последние попытки.
- Читает памятку: подготовить среду, ждать не менее пяти секунд, помогать по одному шагу, остановиться при отказе/боли/усталости.
- Создаёт или меняет student login/PIN.
- Включает отдельно privacy, camera, AI и analytics consent.
- Скачивает JSON export и удаляет профиль после повторного ввода пароля.
- Использует AI-помощник с тремя предложенными вопросами.
- Управляет звуком, calm mode и темой.
- Может выбирать independent/minimal/full внутри guided AAC.

### 10.2 Какие данные доступны

Dashboard содержит total/today/week sessions и minutes, streak, stars, overall coverage, module completion, completed IDs, 7-дневные sensory scores, achievements и recent attempts. Progress API дополнительно содержит average independence, average response time, prompt breakdown, initiatives, refusals, breaks, technical errors, participations и legacy homework summary.

UI показывает не все support_metrics. Например, parent screen не предоставляет детальную временную разбивку подсказок/response time и не позволяет раскрыть каждую попытку до stimulus level.

### 10.3 Полнота роли родителя

Родитель — активный участник consent, доступа ребёнка и guided AAC support, но в образовательной части остаётся в основном наблюдателем:

- не может назначить программу;
- не может редактировать цели;
- не может добавить домашний результат вне legacy homework;
- не может скрыть конкретное упражнение;
- не может настроить количество вариантов/уровень подсказки для sensory;
- не может создать совместную household activity;
- не получает feedback от действующего логопеда;
- не управляет screen-time policy.

Вердикт: **PARTIAL как полноценный участник процесса; IMPLEMENTED как семейный контроль и просмотр**.

## 11. AAC and Communication

### 11.1 Базовый словарь

Есть 63 активные core-карточки:

| Категория | Количество |
|---|---:|
| actions | 12 |
| feelings | 8 |
| food | 8 |
| help | 4 |
| needs | 4 |
| people | 8 |
| places | 9 |
| play | 6 |
| wants | 2 |
| yes_no | 2 |

Карточки имеют label, speech, category, image/pictogram, lemma, grammatical_role, language и флаг core. Для каждой базовой карточки в frontend/public/aac-pictograms есть локальная PNG-пиктограмма.

### 11.2 Критические сообщения

| Требуемое сообщение | Наличие | Реализация |
|---|---|---|
| «Хочу» | Да | Core card, action |
| «Ещё» | Да | Core ready message |
| «Помоги» | Да | Quick message |
| «Стоп» | **Нет** | Есть «Перерыв», но это не семантически идентичный «Стоп» |
| «Нет» | Да | Quick message |
| «Да» | Да | Quick message |
| «Больно» | Да | Quick message |
| «Не хочу» | Да | Quick message |

Quick panel свободной AAC фактически показывает «Помоги», «Больно», «Перерыв», «Не хочу», «Да», «Нет». Он работает одним нажатием и принудительно озвучивает жизненно важное сообщение даже при выключенном общем звуке. Это осознанное и в целом удачное решение, но его нужно явно описать родителю.

### 11.3 Составление фразы

До 8 карточек можно добавлять в строку, удалять по одной и очищать. Backend принимает только уникальные card IDs. UI не предотвращает добавление одной и той же карточки дважды; в таком случае server compose возвращает ошибку.

Разрешённые шаблоны:

- RU/EN: subject + action + object, action + object, subject + action;
- KK: subject + object + action, object + action, subject + action;
- одиночная карточка;
- ready_message только отдельно.

В реальном продукте cards API и schemas допускают только ru. KK/EN-шаблоны — неактивный технический задел.

### 11.4 Персонализация

Родитель может создать карточку с подписью, spoken text и категорией. Frontend всегда задаёт image=/soyle-mark.svg и grammatical_role по умолчанию ready_message. Нет:

- загрузки фотографии знакомого предмета/человека;
- выбора из локальной фототеки;
- edit/delete/archive custom card;
- выбора голоса;
- настройки размера/расположения карточек;
- импорта/export собственного словаря как отдельной функции;
- motor-planning lock, сохраняющего стабильную раскладку между фильтрами.

Favorites работают для parent и student после privacy consent.

### 11.5 История и использование вне упражнений

Free AAC доступна вне занятия, не начисляет баллы и не влияет на progress — сильная сторона. Но freeMode не вызывает GET /api/aac/history и не сохраняет POST /api/aac/history. Поэтому видимый в компоненте блок recent для свободной доски фактически всегда пуст. Guided AAC, напротив, сохраняет phrase history при analytics consent.

Это означает, что обещанная «AAC-история» отражает учебные сценарии, а не наиболее важную спонтанную коммуникацию. Решение о том, нужно ли вообще сохранять free AAC, должно приниматься с учётом приватности и мнения AAC-специалиста; сейчас поведение и UI должны называться точно.

### 11.6 Итог

AAC — самая зрелая функциональная область Soyle: коммуникация отделена от оценки, быстрые сообщения доступны, отказ принимается. Главные пробелы — отсутствие «Стоп», семейных фото, управления custom cards, выбора голоса, реальной KK-локализации, свободной истории и профессионально проверенной структуры ядрового словаря.

## 12. Artificial Intelligence

### 12.1 Интеграция

backend/app/ai_assistant.py использует OpenAI Responses API:

- модель: SOYLE_OPENAI_MODEL, default gpt-4o-mini;
- timeout 20 секунд, max_retries=1;
- store=False;
- строгий JSON Schema;
- max_output_tokens 260 для плана и 420 для ответа;
- системные инструкции запрещают диагноз, лечение, motor exercises и давление после отказа.

### 12.2 AI plan

В OpenAI передаются:

- task и target_count;
- target_minutes;
- возраст в полных годах;
- агрегат последних 14 дней: attempts/refusals/breaks/sensory/mixed counts;
- allowlist активных non-motor упражнений: id, title, instruction, module, skill.

Не передаются name и exact birth date. Ответ модели проверяется по schema и затем по allowlisted IDs. Модель не может создать упражнение, изменить DB, назначить motor или постоянно изменить программу.

Результат не хранится как отдельный plan artifact. Успешное использование записывает token counts/cost в usage_events и минимальный audit event без prompt/result.

### 12.3 AI parent assistant

В OpenAI передаются age и raw parent_question. UI просит не указывать персональные данные, но автоматической redaction, DLP или detection нет. Значит, родитель технически может отправить имя, адрес, контакты или медицинские подробности.

Output schema ограничивает answer, до трёх suggested_actions, needs_professional_help и safety_note. После schema нет:

- retrieval из утверждённой методической базы;
- цитирования источников;
- медицинского rule engine;
- moderation/PII filter;
- confidence;
- human review;
- feedback/report incorrect.

Структурная валидация не гарантирует клиническую безопасность или фактическую точность.

### 12.4 Ошибки и fallback

При отсутствии ключа, invalid key, billing/rate/model/connection error возвращается локальная безопасная подсказка и понятное provider_message. Provider payload/secrets пользователю не показываются. Лимит — по умолчанию 30 успешных OpenAI usage events на actor за час; неуспешные вызовы не записываются как usage.

### 12.5 Риски

| Риск | Уровень | Обоснование |
|---|---|---|
| PII в свободном вопросе родителя | HIGH | Только текстовое предупреждение, нет redaction |
| Медицински звучащий ошибочный совет | HIGH | Schema и prompt не являются clinical validation |
| Неочевидная «персонализация» плана | MEDIUM | UI говорит «под текущий темп», данные очень грубые |
| Student инициирует платный AI-plan | MEDIUM | Endpoint разрешён get_current_user, если parent включил consent |
| Неполный audit AI failures | MEDIUM | Failed provider calls не видны в usage/audit |
| Cost для не-default model равен 0 | LOW/MEDIUM | Формула считает только gpt-4o-mini |

### 12.6 Что отсутствует

- Speech-to-text и автоматическое распознавание речи.
- Запись/хранение аудио ребёнка.
- Оценка произношения.
- AI-generated exercises.
- Автономное изменение программы.
- Диагностика.

Отсутствие speech scoring следует сохранять как честное ограничение, пока нет отдельной научной, этической и юридической программы.

## 13. UX/UI and Accessibility

### 13.1 Что проверено визуально

Была поднята изолированная локальная тестовая среда во временной директории, без production-данных и без OpenAI. В браузере вручную проверены:

- parent login и student login;
- home, course catalog, free AAC;
- sensory demo и ошибочный выбор;
- AI consent gate;
- parent consent/dashboard;
- ширина 320 px и desktop viewport;
- горизонтальное переполнение;
- доступные имена основных controls.

На 320 px горизонтального overflow не обнаружено. Главный student screen, AAC и sensory перестраиваются в одну/две колонки. Основные AAC/sensory targets крупные. Временная среда после проверки не является доказательством production.

### 13.2 Сильные UX-решения

- Отдельная student-навигация снизу.
- Видимый focus-visible.
- prefers-reduced-motion и calm mode.
- High-contrast theme.
- Нейтральная feedback copy, без красного punitive sound.
- Sensory answer labels скрыты до завершения.
- Повтор аудио и три скорости.
- Consent выключен по умолчанию и разделён на категории.
- AI чётко помечен, описывает limits и не блокирует базовый план.
- Free AAC не геймифицирована.
- Skip link есть на лендинге.

### 13.3 Подтверждённые проблемы

| Проблема | Влияние | Доказательство |
|---|---|---|
| Закрытый mobile sidebar parent остаётся в accessibility tree | Screen reader/keyboard может видеть off-canvas controls | aside только transform:translateX; нет inert/aria-hidden/focus management |
| Нет focus trap/return для mobile menu и notification panel | Непредсказуемая keyboard navigation | AuthenticatedApp |
| Детский каталог содержит взрослую копию | Повышенная когнитивная нагрузка | GamesScreen всегда выводит tip и «Начните...» |
| Часть вспомогательного текста 8–11 px | Плохая читаемость, особенно при нарушениях | globals.css |
| Некоторые controls 38–40 px | Ниже child-friendly 44–48 px, хотя выше WCAG 24 px | back/favorite/menu/search metrics |
| Progress SVG не имеет табличной альтернативы | Screen reader получает только общий aria-label | ProgressScreen |
| График без осей/точных значений | Трудно интерпретировать и сравнивать | ProgressScreen |
| Заголовок на 320 px переносит «?» отдельной строкой | Визуально неаккуратно | Home screenshot |
| Нет настройки text/card size | Ограничивает low-vision и motor users | SettingsScreen |
| Sensory без explicit break/refusal | Ребёнок должен интерпретировать back | SensoryGame |
| Motor camera-only completion | Нет альтернативной modality | MotorGame |
| Нет automated a11y tests | Регрессии не блокируются | tests |

### 13.4 Двигательная и сенсорная доступность

- Большинство игровых карточек пригодно для touch.
- Нет drag-and-drop и точных жестов.
- AAC требует только tap.
- Motor требует positioning лица, camera permission и стабильное движение; alternative manual observation отсутствует.
- Visual TTS fallback не может заменить sensory задачу, потому что показ слова изменит проверяемую механику; технический no-score exit реализован корректно.
- Микрофон не требуется, поэтому дети без устной речи не блокируются.

### 13.5 Performance UX

Положительно: MediaPipe импортируется динамически только при motor start; Next Image используется для многих изображений; API имеет timeout; есть loading copy.

Риски:

- SoyleApp.tsx — единый крупный client bundle для всех ролей.
- Данные children/settings/exercises/dashboard/active-session загружаются несколькими независимыми запросами без единого error state.
- Нет skeletons; часть ошибок молча превращается в пустые данные.
- public assets около 49 МБ.
- Google Fonts загружаются через CSS import, но final style использует системный Inter; это потенциально лишний network dependency.
- Нет измерений Core Web Vitals, bundle analysis или low-end device profiling.
- Service worker создаёт видимость offline shell, но приложение без API не становится функционально offline.

### 13.6 Accessibility verdict

Статический и ручной осмотр показывает хорошую базу, но не подтверждает WCAG 2.2 AA. До пилота обязательны screen reader, keyboard-only, switch control, 200% zoom/text scaling, color contrast и реальные iOS/Android/tablet tests с представителями целевой аудитории.

## 14. Localization

### 14.1 Фактический статус

Текущий продукт поддерживает только русский:

- supportedInterfaceLanguages = ["ru"];
- UserSettingsUpdate.language = Literal["ru"];
- TTSRequest.language = Literal["ru"];
- AAC schemas = Literal["ru"];
- cards query жёстко фильтрует language='ru';
- UI strings в SoyleApp.tsx и LandingPage.tsx hard-coded по-русски;
- html lang нормализуется к ru.

### 14.2 Казахский и английский

В типах frontend ещё встречаются "ru" | "kk" | "en", а AAC grammar содержит KK/EN patterns. Эти элементы не позволяют выбрать язык, не дают cards/content/TTS и не являются локализацией.

Локальный игнорируемый документ LOCALIZATION_STATUS.md утверждает, что RU/EN/KK ранее были доступны и проверялись. Это противоречит текущему коду и явно устарело. Источником истины следует считать текущие schemas и i18n.ts.

### 14.3 Матрица локализации

| Слой | Русский | Казахский |
|---|---|---|
| Публичный интерфейс | IMPLEMENTED | NOT_IMPLEMENTED |
| Авторизация/кабинеты | IMPLEMENTED | NOT_IMPLEMENTED |
| Упражнения | IMPLEMENTED technical | NOT_IMPLEMENTED |
| AAC cards | 63 cards | Нет cards |
| TTS | PARTIAL | NOT_IMPLEMENTED |
| AI | Ответы instruct по-русски | NOT_IMPLEMENTED |
| Родительские материалы | Русский | Нет |
| Specialist materials | Роли нет | Роли нет |
| Переключение языка | Показывает RU | Нет выбора |
| Хранение language | Поле есть, schema фиксирует ru | Недоступно |

### 14.4 Архитектурные ограничения

- Строки не вынесены в translation catalogs.
- Русские plural rules написаны вручную в компонентах.
- CSS широко использует физические left/right, а не logical properties.
- Нет pseudo-localization, missing-key checks и content-versioning.
- Language, AAC morphology, TTS voice и reviewed clinical content нужно проектировать как разные слои.

Вердикт: **реальная мультиязычность отсутствует; русский интерфейс не «автоматически переводится»**.

## 15. Database and API

### 15.1 Таблицы и связи

| Таблица | Назначение | Основные связи/заметки |
|---|---|---|
| users | Parent/admin/legacy specialist | parent children; password hash; synthetic email |
| children | Профиль ребёнка | parent_id cascade |
| student_accounts | Отдельный child login/PIN | one-to-one child |
| exercises | Каталог 35 seed items + admin items | Нет unique target constraint |
| learning_sessions | План и позиция | exercise_ids хранится JSON text |
| sessions | Попытки/участие/метрики | child cascade; exercise/session SET NULL |
| specialist_children | Legacy assignments | composite PK |
| assigned_exercises | Legacy individual assignment | specialist/child/exercise |
| specialist_recommendations | Legacy feedback | specialist/child/exercise |
| schema_migrations | Версии 1–8 | Маркеры, не отдельные migration scripts |
| usage_events | AI tokens/cost | child SET NULL; user_id без FK |
| user_settings | Настройки user/student | user_key вида user:ID/student:ID, без FK |
| aac_cards | Core и custom cards | custom child cascade; created_by без FK |
| aac_favorites | Избранное | child/card cascade |
| aac_phrase_history | История guided phrases | child cascade; card_ids JSON |
| notifications | Module completion | user/child cascade; unique event_key |
| child_goals | Legacy specialist goals | child/specialist cascade |
| homework_assignments | Legacy homework | child cascade; specialist/goal SET NULL |
| child_consents | Granular consent | one-to-one child, parent/consenter refs |
| auth_attempts | Rate-limit events | hashed identifier, retention 1 day |
| audit_events | Critical-action journal | actor_key/object_id text, без FK |

Некоторые важные enum-like поля имеют CHECK только в initial schema или не имеют constraints вообще: status, attempt_status, language, category, user_settings values. Основная защита идёт через Pydantic и код API.

### 15.2 Миграции

init_db:

- выполняется при каждом startup;
- создаёт всю схему строкой SQL;
- introspects columns и добавляет отсутствующие через ALTER;
- обновляет существующий контент;
- принудительно деактивирует specialists;
- архивирует неподдержанные exercise targets;
- вставляет schema_migrations 1–8.

Это не воспроизводимый migration history: нет отдельных up/down scripts, transaction plan, staging dry-run, rollback или проверки concurrent deploy. PostgreSQL поддержка написана вручную через замену ? на %s и разделение executescript по ;.

### 15.3 Полный реестр endpoints

#### Health и auth

| Метод и путь | Роль | Назначение | Статус |
|---|---|---|---|
| GET /health | Public | Liveness JSON | IMPLEMENTED local |
| POST /api/auth/register | Public | Parent registration | IMPLEMENTED |
| POST /api/auth/login | Public | Parent/admin login | IMPLEMENTED |
| POST /api/auth/student-login | Public | Student PIN login | IMPLEMENTED |
| GET /api/auth/me | Auth | Session restore | IMPLEMENTED |
| POST /api/auth/logout | Cookie/Bearer | Clear cookies | IMPLEMENTED |

#### Settings, TTS, notifications

| Метод и путь | Роль | Назначение | Статус |
|---|---|---|---|
| GET /api/settings | Auth | Account settings | IMPLEMENTED |
| PUT /api/settings | Auth | Save settings | IMPLEMENTED |
| POST /api/tts | Auth | Generate temp speech file | PARTIAL by platform |
| GET /api/notifications | Parent | Parent notifications | IMPLEMENTED |
| PATCH /api/notifications/{id}/read | Parent | Mark one read | IMPLEMENTED |
| PATCH /api/notifications/actions/read-all | Parent | Mark all read | IMPLEMENTED |

#### Children and student account

| Метод и путь | Роль | Назначение | Статус |
|---|---|---|---|
| GET /api/children | Auth | Scoped list; admin gets all | IMPLEMENTED |
| POST /api/children | Parent | Create child | IMPLEMENTED |
| GET /api/children/{id}/student-account | Parent owner | Read child login | IMPLEMENTED |
| POST /api/children/{id}/student-account | Parent owner | Create/update login/PIN | IMPLEMENTED |

#### Exercises, AAC and sessions

| Метод и путь | Роль | Назначение | Статус |
|---|---|---|---|
| GET /api/exercises | Auth | Active catalog; admin excludes motor | IMPLEMENTED with inconsistency |
| GET /api/aac/cards/{child_id} | Scoped auth | Core + custom cards | IMPLEMENTED RU |
| POST /api/aac/cards | Parent owner | Create custom card | PARTIAL |
| PATCH /api/aac/cards/{card_id}/favorite | Scoped auth | Favorite card | IMPLEMENTED |
| POST /api/aac/compose | Scoped auth | Validate/compose phrase | IMPLEMENTED RU |
| POST /api/aac/history | Scoped auth + analytics consent | Save phrase | IMPLEMENTED guided only in UI |
| GET /api/aac/history/{child_id} | Scoped auth | Last 12 phrases or empty | IMPLEMENTED API |
| POST /api/sessions | Scoped auth + privacy consent | Server-validated result | IMPLEMENTED |
| GET /api/progress/{child_id} | Scoped auth | Detailed aggregates | IMPLEMENTED API |
| GET /api/dashboard/{child_id} | Scoped auth | UI aggregates | IMPLEMENTED |
| GET /api/session-plan/{child_id} | Scoped auth | Local plan | PARTIAL adaptation |
| POST /api/learning-sessions | Scoped auth + consent | Persist plan | IMPLEMENTED |
| PATCH /api/learning-sessions/{id}/pause | Scoped auth + consent | Pause/resume toggle | IMPLEMENTED |
| GET /api/learning-sessions/{id} | Scoped auth | Session detail | IMPLEMENTED |
| GET /api/children/{id}/active-session | Scoped auth | Resume latest | IMPLEMENTED |

#### AI

| Метод и путь | Роль | Назначение | Статус |
|---|---|---|---|
| POST /api/ai/plan/{child_id} | Scoped auth | Local fallback/OpenAI plan | PARTIAL |
| POST /api/ai/ask/{child_id} | Parent owner + AI consent | Parent answer | PARTIAL |

#### Hidden legacy specialist/goals/homework

Все 13 помечены include_in_schema=False.

| Метод и путь | Требуемая роль | Статус |
|---|---|---|
| GET /api/specialist/children/{child_id} | specialist | BROKEN/unreachable |
| POST /api/specialist/assigned-exercises | specialist | BROKEN/unreachable |
| POST /api/specialist/recommendations | specialist | BROKEN/unreachable |
| GET /api/goals/{child_id} | Auth | BROKEN: данные некому создать |
| POST /api/specialist/goals | specialist | BROKEN/unreachable |
| PATCH /api/specialist/goals/{goal_id} | specialist | BROKEN/unreachable |
| GET /api/homework/{child_id} | Auth | BROKEN: данные некому создать |
| POST /api/specialist/homework | specialist | BROKEN/unreachable |
| PATCH /api/homework/{id}/result | Parent | BROKEN: assignment flow недоступен |
| PATCH /api/specialist/recommendations/{id} | specialist | BROKEN/unreachable |
| GET /api/admin/specialist-assignments | admin | BROKEN/hidden |
| POST /api/admin/specialist-assignments | admin | BROKEN/hidden |
| DELETE /api/admin/specialist-assignments/{specialist_id}/{child_id} | admin | BROKEN/hidden |

#### Consent and data rights

| Метод и путь | Роль | Назначение | Статус |
|---|---|---|---|
| GET /api/children/{id}/consent | Parent/student scoped | Read consent | IMPLEMENTED |
| PUT /api/children/{id}/consent | Parent owner | Grant/revoke | IMPLEMENTED/PARTIAL semantics |
| GET /api/children/{id}/export | Parent owner | JSON export | IMPLEMENTED |
| DELETE /api/children/{id} | Parent owner + password | Delete child | IMPLEMENTED |

#### Admin

| Метод и путь | Назначение | Статус |
|---|---|---|
| GET /api/admin/stats | Counts | IMPLEMENTED |
| GET /api/admin/users | Active non-specialist adults | IMPLEMENTED |
| GET /api/admin/students | Student accounts | IMPLEMENTED |
| GET /api/admin/usage | Aggregates/history/cost | IMPLEMENTED |
| GET /api/admin/audit | Last audit events | PARTIAL coverage |
| PATCH /api/admin/users/{id}/role | parent/admin | IMPLEMENTED, no last-admin guard |
| PATCH /api/admin/users/{id}/active | Activate/deactivate | IMPLEMENTED |
| POST /api/admin/exercises | Create row | BROKEN as constructor |
| PUT /api/admin/exercises/{id} | Replace exercise fields | IMPLEMENTED API, no UI edit |
| DELETE /api/admin/exercises/{id} | Archive | IMPLEMENTED |

### 15.4 API design observations

- Все ответы синхронные; background job infrastructure отсутствует.
- OpenAPI содержит 47 текущих endpoints, hidden legacy — 13.
- Pydantic хорошо ограничивает длины, enum values и числовые диапазоны.
- API version prefix отсутствует.
- Ошибки в основном на русском и возвращаются через detail.
- Нет pagination у children/exercises/users/students; audit/usage имеют limit.
- Нет ETag/version fields для optimistic concurrency.
- learning_sessions.exercise_ids, goal exercise_ids и AAC card_ids хранятся JSON text, что усложняет integrity queries.

## 16. Security and Privacy

### 16.1 Подтверждённые защитные меры

- Password/PIN hashes через pwdlib PasswordHash.recommended, локально Argon2.
- HS256 JWT с exp: 24 часа adult, 12 часов student.
- HttpOnly auth cookie; Secure и префикс __Host- в production.
- Отдельная readable CSRF-cookie + X-CSRF-Token.
- Origin check для unsafe methods.
- Exact CORS origins и credentials.
- Production startup падает при default/коротком secret.
- Demo seed запрещён в production/staging.
- Login rate limit хранится в БД по SHA-256 account/client identifiers.
- Parent/student horizontal access checks покрыты backend-тестом.
- Camera кадры и landmarks не отправляются в API.
- Микрофон запрещён Permissions-Policy; audio ребёнка не записывается.
- OpenAI key server-side; store=False; plan IDs проходят allowlist.
- Child delete требует текущий пароль родителя.
- Не найдено tracked .env или секретов; локальные .env игнорируются. Значения секретов не читались и не выводились.

### 16.2 Риски и приоритет

| Приоритет | Риск | Доказательство/состояние | Требуемое решение на следующем этапе |
|---|---|---|---|
| RELEASE BLOCKER | Нет утверждённой правовой модели детских данных | Privacy/Terms сами названы черновиками | Определить operator, jurisdiction, lawful basis, retention, processors, incidents, backups |
| HIGH | Motor active вопреки Terms/README | /api/exercises parent/student возвращает 6 motor | Немедленно решить product truth до пилота; не просто менять копию без clinical review |
| HIGH latent | Specialist IDOR при повторном включении | ensure_child_access не проверяет assignments/consent | Перепроектировать specialist authorization |
| HIGH | Child profile хранится до privacy consent | create_child не вызывает consent gate | Юридически определить lawful basis и честный onboarding |
| HIGH | Raw AI question может содержать PII | Только UI-warning | DLP/redaction или явный reviewed policy/flow |
| HIGH | Consent semantics не совпадают с использованием | sessions/progress используются при analytics=false; AI plan читает sessions | Чётко разделить core storage, analytics и AI purpose |
| HIGH operational | Startup-DDL без migration/rollback | database.py | Ввести контролируемый production migration process |
| MEDIUM | Admin получает всех children через generic endpoint | list_children admin branch | Data minimization и отдельный admin purpose |
| MEDIUM | Нет password recovery/MFA/session revocation | Auth API | Threat model parent/admin accounts |
| MEDIUM | CSP разрешает unsafe-inline; style unsafe-inline | next.config.ts | Nonce/hash strategy и XSS review |
| MEDIUM | Audit неполон | Не логируются login/admin exercise/student changes | Определить security audit events и retention |
| MEDIUM | Student AI-plan расход | ai_plan принимает student | Policy/limit отдельно для child actor |
| MEDIUM | Rate limit зависит от DB и proxy config | SOYLE_TRUST_PROXY_HEADERS default off | Production reverse-proxy validation |
| MEDIUM | Нет data-at-rest encryption/application key strategy | DB/config | Инфраструктурная проверка шифрования и backups |
| MEDIUM | Нет dependency vulnerability scan/SBOM | Не запускался online audit | Release security pipeline |
| LOW/MEDIUM | SOYLE_ALLOWED_ORIGIN_REGEX есть в example, но не используется | main.py читает только exact list | Убрать неоднозначность конфигурации |
| LOW/MEDIUM | Admin может деактивировать/понизить последнего admin | Нет safeguard | Определить recovery/governance |
| LOW | Custom card/admin icon принимает произвольную строку | Schema max length only | Ограничить источники при появлении upload/remote media |

### 16.3 IDOR и разграничение

Текущие parent/student paths используют ensure_child_access. AAC card ownership, favorite, compose, history, student account, consent, dashboard, export и delete делают child scoping. Тест создаёт вторую семью и подтверждает 403 на чужой dashboard.

Не обнаружено подтверждённого current-role IDOR. Specialist issue является dormant/latent, потому что роль сейчас недоступна.

### 16.4 Cookies, CSRF, CORS и XSS

- __Host-cookie требования path=/, Secure и отсутствие Domain соблюдаются в production config.
- SameSite допускает lax/strict/none; none запрещён вне secure production.
- Cookie-auth unsafe request требует совпадения CSRF cookie/header.
- Bearer-auth не требует CSRF, что стандартно; UI в production token не получает.
- CORS разрешает все methods/headers, но только exact origins.
- Frontend CSP запрещает object/frame ancestors, но script-src unsafe-inline и style-src unsafe-inline ослабляют XSS-защиту.
- React по умолчанию экранирует text; опасный HTML-rendering в просмотренных компонентах не найден.

### 16.5 Данные и удаление

Export включает child profile, consents, settings, sessions, custom AAC, favorites и history. Delete каскадирует основные child-related таблицы. usage_events.child_id становится NULL; audit_events не имеет FK и сохраняет object_id. Политика удаления из резервных копий отсутствует.

usage_events не хранит prompt/result, что хорошо. audit metadata в UI показывается как JSON. auth_attempts хранит только hash identifiers и удаляет записи старше дня. Сроки хранения sessions/AAC/audit/usage не определены.

### 16.6 Uploads, audio и camera

Upload surface отсутствует, поэтому риски malware/MIME/object storage сейчас не применимы. Пользовательские фото также невозможны.

TTS получает только текст, не audio ребёнка. Camera работает с getUserMedia audio:false и локальным FaceLandmarker. Сервер принимает итог movement_detected и metadata; биометрический шаблон не хранится. Тем не менее обработка лица ребёнка требует отдельной правовой и этической оценки даже при on-device обработке.

## 17. Tests and Reliability

### 17.1 Реально выполненные проверки

| Проверка | Результат | Примечание |
|---|---|---|
| Backend pytest | **20 passed in 0.59s** | PYTHONDONTWRITEBYTECODE=1, OpenAI key отключён, pytest cache отключён |
| Frontend node tests | **11 passed** | Есть warning MODULE_TYPELESS_PACKAGE_JSON |
| Frontend ESLint | **PASS** | Без ошибок |
| Python dependency check | **No broken requirements found** | pip check |
| npm dependency tree | Завершено | Основные версии подтверждены; 2 extraneous packages |
| Manual browser smoke | PASS в проверенных сценариях | Изолированная локальная БД; parent/student, mobile 320 px, AAC, sensory, consent |
| Git tracked state до отчёта | Clean | Продуктовый код не менялся |

Production build намеренно не запускался: он записывает frontend/.next и нарушил бы ограничение аудита «не изменять проект». Существующая документация утверждает о прежних успешных builds, но это не считается текущей верификацией.

### 17.2 Покрытие backend-тестов

backend/tests/test_workflows.py проверяет:

1. Cookie session, CSRF, Origin и logout.
2. Разделение account/client login identifiers.
3. Роли admin/parent и cross-family child access.
4. Rate limit.
5. AI plan allowlist и скрытие specialist role.
6. Безопасный AI fallback.
7. Понятную ошибку invalid OpenAI key.
8. Валидацию model IDs и запись tokens.
9. Student actor в AI usage.
10. Learning-session pause/resume и measurements.
11. AI consent opt-in и немедленный revoke.
12. Student read-only consent.
13. Camera consent и revoke/versioning.
14. Server-side score и разделение non-scored outcomes.
15. AAC grammar templates.
16. Точный active mixed scenario set.
17. Точный active sensory set.
18. TTS rejection неизвестного языка.
19. Запрет будущей birth_date.
20. Полноту export и password-protected delete.

### 17.3 Покрытие frontend-тестов

frontend/tests:

- 4 runtime unit tests motor detection;
- 7 source/regression tests на cookie/CSRF, отсутствие localStorage AAC, локальность camera, Russian-only, service-worker exclusions, security headers и real weekday activity.

Большинство safety-regressions — проверки текстовых паттернов исходников, а не реальный browser behavior. Они полезны как guardrails, но не заменяют E2E.

### 17.4 Непокрытые риски

- Нет Playwright/Cypress E2E.
- Нет automated accessibility/axe.
- Нет visual regression.
- Нет PostgreSQL integration/migration tests.
- Нет production/staging smoke.
- Нет load/concurrency test; race активной learning session не проверена.
- Нет security DAST/SAST/dependency audit.
- Нет тестов backup/restore и delete-from-backup.
- Нет real camera/browser matrix.
- Нет TTS pronunciation/voice matrix.
- Нет offline/update/service-worker lifecycle test.
- Нет tests admin exercise custom target behavior.
- Нет tests stale legacy specialist authorization, потому что role блокируется.
- Нет тестов с реальными детьми, родителями, логопедами и ассистивными технологиями.

### 17.5 Reliability observations

- API client timeout 8 секунд, OpenAI timeout 20 секунд и safe fallback улучшают отказоустойчивость.
- Несколько frontend fetch ошибок молча превращаются в пустые arrays/null; пользователь может принять outage за отсутствие данных.
- AI fallback возвращается с HTTP success, поэтому operational failure нужно различать по generated_by/provider_error.
- TTS создаёт временный файл и FileResponse; lifecycle временных файлов и concurrent load требуют отдельной проверки.
- System status в AdminScreen отображает «Система работает» статически и не зависит от /health или DB/OpenAI health.

## 18. Technical Debt

### 18.1 Архитектурный

1. **Frontend monolith:** SoyleApp.tsx содержит auth, navigation, три игры, parent, AI, progress и admin.
2. **Backend monolith:** main.py объединяет HTTP, domain rules, SQL, aggregation, TTS и admin.
3. **Нет domain/service/repository boundaries:** трудно отдельно тестировать policies, planning и consent purpose.
4. **Client-side screens вместо routes:** нет deep links, browser history и per-screen code splitting.
5. **Ручные SQL и JSON-in-text:** слабее relational integrity и queryability.
6. **Startup DDL вместо migrations:** риск production drift.

### 18.2 Продуктовый контент

1. Active motor противоречит README/Terms.
2. Stale ignored documents противоречат текущему коду: LOCALIZATION_STATUS заявляет KK/EN, roadmap — manual motor completion, тогда как текущая реализация Russian-only и camera-only.
3. Course units frontend и backend имеют разные target composition.
4. primary_module хранится, но не используется.
5. difficulty почти декоративна.
6. Архивные sensorySets остаются в frontend bundle.
7. 34 MP3 assets не используются.

### 18.3 Данные и API

1. Нет unique exercises.target; дубликаты допустимы.
2. Нет unique partial index на active learning session per child.
3. user_settings.user_key и usage_events.user_id не имеют FK.
4. Многие status/category values не ограничены DB constraints.
5. Timestamps хранятся как TEXT.
6. Timezone dashboard жёстко задан Asia/Almaty.
7. public_user возвращает email=username, а users.email синтетический username@local.soyle.
8. Нет API versioning и concurrency control.

### 18.4 Frontend behavior

1. Settings camera_enabled — фактически dead/несогласованное поле.
2. Free AAC history code недостижим.
3. addCard допускает duplicate card, который backend отклоняет.
4. Admin add exercise всегда target=custom и не создаёт runnable content.
5. Admin не использует существующий PUT edit endpoint и не умеет reactivate.
6. Parent не может добавить второго ребёнка через UI после onboarding.
7. Нет reusable loading/error boundary.
8. Off-canvas accessibility state не управляется.

### 18.5 Возможность повторного использования

Можно безопасно переиспользовать:

- cookie/CSRF/auth scaffolding;
- ensure_child_access после расширения policy;
- Pydantic validation style;
- consent UI pattern;
- session outcome model completed/participated/refused/break/technical_error;
- AAC core board, pictograms, favorites, quick messages и grammar validation;
- sensory prompt ladder;
- AI structured schema, allowlist и fallback;
- dashboard distinction coverage vs game result;
- responsive child bottom navigation.

Требует переработки перед расширением:

- exercise content model и admin constructor;
- learning/adaptation engine;
- specialist authorization;
- migrations;
- monolithic frontend/backend;
- localization architecture;
- analytics consent semantics;
- progress chart/reporting;
- motor exercise policy и completion.

## 19. Gap Analysis

| Целевое направление | Уже реализовано | Частично / работает иначе | Отсутствует | Архитектурный барьер | Что сохранить |
|---|---|---|---|---|---|
| 1. Игровые упражнения ребёнка | 3 mechanics, 19 active items, sessions | Узкий sensory vocabulary; AAC часто one-card; motor camera-only | Actions, instructions, syllables, speech, stories | exercise row не описывает mechanic/content assets | Calm feedback, outcome statuses, prompt ladder |
| 2. Кабинет родителей | Dashboard, history, consent, student access, export/delete, guidance | Родитель наблюдает, но почти не управляет program | Screen time, household tasks, manual outcomes, clinician feedback | Нет active goals/homework workflow | Plain-language metrics и stop criteria |
| 3. Инструменты логопеда | Legacy schema/API only | support_metrics можно переиспользовать | Login, UI, profile, assignments, reports | Роль заблокирована; latent IDOR | Существующие goal/homework concepts после redesign |
| 4. AAC | 63 cards, quick messages, compose, favorites, free board | Custom cards и grammar узкие; free history absent | Photo upload, voice, «Стоп», KK cards | Card model лучше exercise model, но media lifecycle отсутствует | Free/unscored access и refusal semantics |
| 5. Индивидуальная адаптация | Session duration, AI allowlist | Возраст и 14-day aggregate only | Assessment, skill profile, goals, spaced repetition | Child model и planner слишком бедны | Safe fallback and explainability |
| 6. Функциональный прогресс | Coverage, game score, prompts/outcomes | UI показывает лишь часть metrics | Transfer to daily life, goal trends, professional report | Нет longitudinal goal model в active product | Отделение participation от correctness |
| 7. RU + KK | Russian product | KK grammar stub only | Kazakh UI/content/TTS/AAC/review | Hard-coded strings and ru schemas | Явное скрытие непроверенного языка |
| 8. Безопасные детские данные | Cookie/CSRF, isolation, consent, export/delete, local camera | Consent purposes, audit, retention incomplete | Legal/DPO package, backup deletion, incident process | Startup/multi-purpose data model | Opt-in defaults and data minimization |

### 19.1 Соответствие главной концепции

Soyle уже объединяет ребёнка, родителя, AAC и безопасно ограниченный AI. Но это пока семейный MVP, а не комплексная платформа сопровождения: специалист, функциональный профиль, адаптивная программа, двуязычие и доказуемый progress отсутствуют.

## 20. Existing Strengths

1. **Честная граница medical claims в большинстве UI:** AI и progress не называют себя диагностикой.
2. **AAC как самостоятельная коммуникация:** доступна вне упражнений и не оценивается.
3. **Refusal-aware data model:** отказ, перерыв и техническая ошибка отделены от «неправильного ответа».
4. **Server-side score:** клиентский score не принимается на доверии.
5. **Семейная изоляция:** текущие parent/student routes последовательно используют child scoping.
6. **Защищённая web session:** HttpOnly, CSRF, Origin, Secure production cookies.
7. **AI allowlist/fallback:** модель не может выбрать неизвестное или motor exercise.
8. **AI data minimization для plan:** без имени и точной даты рождения.
9. **Local camera processing:** frames/landmarks не передаются на сервер.
10. **Спокойный sensory prompting:** repeat → reduced choice → model without penalty.
11. **Russian-only gate:** непроверенные KK/EN не выставлены наружу, несмотря на устаревшие документы.
12. **Хорошая responsive база:** основные экраны работают на 320 px без horizontal overflow.
13. **Granular consent UI:** optional processing выключено по умолчанию и может быть отозвано.
14. **Экспорт/удаление:** семейные data-rights представлены в интерфейсе.
15. **Тесты safety invariants:** 31 локальный тест прошёл.

Эти решения следует сохранить как требования при следующем проектировании, а не потерять при добавлении функций.

## 21. Critical Findings

### CF-01 — Release blocker: продукт не готов к реальным детским данным

Нет утверждённого privacy/legal пакета, retention, backup deletion, incident response, production smoke, clinical content sign-off и accessibility pilot. Сами legal pages называют себя черновиками.

### CF-02 — High: моторные упражнения доступны вопреки публичным утверждениям

README и Terms говорят, что motor/articulation не предлагаются. Фактически parent/student exercises API и UI показывают 6 активных motor exercises, backend принимает их результат при camera consent, tests это закрепляют. Такое расхождение опаснее обычной stale documentation, потому что относится к ребёнку, камере и clinical expectations.

### CF-03 — High latent: specialist role нельзя просто включить

Legacy specialist API не проверяет назначение специалиста и согласие на sharing в общем access helper. Текущая блокировка снижает риск, но превращает восстановление роли в security redesign, а не feature toggle.

### CF-04 — High: consent model не полностью соответствует жизненному циклу данных

Child PII сохраняется до privacy consent. analytics=false не запрещает хранение sessions, dashboard/progress и использование recent sessions в AI-plan; в UI analytics описан как «Описательная история и AAC». Purpose boundaries неочевидны.

### CF-05 — High: AI parent question может передать PII и неверный sensitive advice

Предупреждение не заменяет redaction. Strict JSON гарантирует форму, но не доказанную безопасность смысла. Нет grounding на утверждённых материалах или источников.

### CF-06 — High functional: admin exercise constructor создаёт нерunnable content

Новый mixed target custom не имеет aacScenario и не может удовлетворить isAACScenarioSuccess. Новый sensory custom использует fallback animals независимо от title/instruction. UI не создаёт stimulus set или mechanic. Функция существует, но её результат не соответствует обещанному exercise.

### CF-07 — Major product gap: действующего логопеда нет

Это один из восьми столпов целевой концепции. Legacy tables/endpoints не компенсируют отсутствие входа, UI и безопасной policy.

### CF-08 — Major product gap: адаптация номинальная

Нет assessment/profile/goals/error-driven progression. Локальный planner одинаков для всех, AI знает только возраст и counts. Термин «индивидуальный план» сейчас был бы вводящим в заблуждение.

### CF-09 — Major product gap: казахского языка нет

Ни UI, ни content, ни AAC, ни TTS не доступны на казахском. Остаточный grammar pattern не меняет вывод.

### CF-10 — Major measurement risk: coverage легко принять за development progress

UI улучшил подпись, но overall, stars, streak и badges всё ещё визуально доминируют. Completed/participated уникальный exercise повышает coverage независимо от освоения.

### CF-11 — Medium/High operational: схема меняется на startup

Нет полноценного migration/rollback. Это риск data loss/drift при production deploy и масштабировании нескольких instances.

### CF-12 — Accessibility blocker for pilot: нет реальной AT/device validation

Есть сильная responsive база, но off-canvas menu semantics, мелкий secondary text, chart alternative и camera-only motor не позволяют заявить WCAG/pilot readiness.

## 22. Recommendations for Next Planning Phase

Это не план реализации и не предложение немедленно менять код. Следующий ТЗ должен сначала ответить на следующие вопросы.

### 22.1 Product and clinical governance

1. Кто clinical/content owner и кто утверждает каждое упражнение?
2. Каков целевой возраст и какие функциональные профили включаются/исключаются?
3. Какие наблюдаемые навыки измеряет каждая mechanic, а какие утверждения запрещены?
4. Нужны ли motor exercises вообще; если да, кому, по назначению кого и с какой альтернативой без camera?
5. Какие stop criteria обязательны во всех mechanics?
6. Какие результаты имеют смысл: participation, independence, prompt level, generalization, caregiver report?

### 22.2 Specialist model

1. Кто создаёт связь specialist-child и кто её подтверждает?
2. Как родитель выдаёт/отзывает доступ и выбирает data scope?
3. Нужен ли organization/clinic tenant?
4. Что специалист может читать, назначать, редактировать и экспортировать?
5. Как разделить clinical record и consumer app data?
6. Как аудитировать каждый просмотр/изменение чувствительных данных?

### 22.3 Assessment and adaptation

1. Какая минимальная функциональная стартовая оценка допустима и понятна семье?
2. Как различать receptive, expressive, AAC, imitation, attention и motor abilities?
3. Какие правила progression/rollback детерминированы и объяснимы?
4. Какие настройки родитель/логопед может переопределить?
5. Как проверять retention/generalization, не выдавая gameplay за development?
6. Где AI допустим только как suggestion, а где вообще не нужен?

### 22.4 Exercise platform

1. Какие first-class mechanic types нужны вместо произвольного target string?
2. Как version content, translations, stimuli, audio, criteria и safety notes?
3. Как author preview и validate exercise до publication?
4. Какие asset licenses и provenance обязательны?
5. Как гарантировать, что archived/unsupported content не активируется без complete package?

### 22.5 AAC

1. Какой core vocabulary и layout утверждает AAC-специалист?
2. Нужен ли явный «Стоп» рядом с «Перерыв»?
3. Как разрешить family photos безопасно: формат, moderation, storage, deletion?
4. Нужны ли edit/delete/export custom cards?
5. Должна ли free AAC history храниться вообще, кем и сколько?
6. Как обеспечить стабильное расположение карточек и разные access methods?
7. Какие voice choices допустимы для RU/KK?

### 22.6 Privacy, security and legal

1. Каково правовое основание core child profile до consent?
2. Что относится к necessary service, optional analytics, AI и specialist sharing?
3. Где физически хранятся production DB/backups и кто subprocessors?
4. Сроки хранения для каждого data class?
5. Как удаление распространяется на backup/audit/usage?
6. Как реализуются recovery, MFA, incident response и account compromise?
7. Какие страны/законы применимы и кто DPO/operator?

### 22.7 Localization

1. Язык интерфейса, языка ребёнка, AAC и TTS — независимые настройки или единый профиль?
2. Кто утверждает казахскую лексику, морфологию и pronunciation?
3. Какие варианты казахского/русского и bilingual phrases нужны?
4. Как version translation/content review?
5. Какова fallback policy при отсутствии voice/card?

### 22.8 Release evidence

До внешнего pilot planning должен требовать:

- approved legal package;
- content sign-off по каждому active item;
- security review и dependency scan;
- PostgreSQL migration rehearsal + rollback;
- backup/restore/delete drill;
- production cookie/CORS/CSP smoke;
- E2E critical flows;
- screen reader/switch/keyboard/zoom/device matrix;
- parent/specialist usability protocol;
- child pilot protocol с consent и stop criteria;
- claim review, исключающий диагноз/лечение/неподтверждённый progress.

## 23. Relevant Files

### Корень

| Путь | Назначение |
|---|---|
| README.md | Текущее описание/запуск; содержит противоречие по motor |
| start.sh | Локальный bootstrap и отдельные frontend/backend processes |
| main.py | Корневая локальная обёртка запуска |
| .gitignore | Игнорирует secrets, DB, builds и локальные audit docs |

### Backend

| Путь | Назначение |
|---|---|
| backend/app/main.py | 60 endpoints, middleware, business logic, aggregation, TTS |
| backend/app/database.py | 21-table DDL, startup changes, 35 exercises, 63 AAC cards |
| backend/app/schemas.py | Pydantic validation |
| backend/app/security.py | JWT, cookies, CSRF support, roles, Argon2 |
| backend/app/ai_assistant.py | OpenAI Responses, prompts, JSON schemas, safe provider errors |
| backend/app/aac_grammar.py | RU/EN/KK role templates |
| backend/api/index.py | Vercel ASGI entry |
| backend/vercel.json | Rewrite all backend traffic to API entry |
| backend/requirements.txt | Runtime dependencies |
| backend/requirements-dev.txt | Test dependencies |
| backend/tests/conftest.py | Isolated test DB and fixtures |
| backend/tests/test_workflows.py | 20 workflow/security/content tests |

### Frontend

| Путь | Назначение |
|---|---|
| frontend/app/page.tsx | Public landing route |
| frontend/app/app/page.tsx | Product route |
| frontend/app/privacy/page.tsx | Privacy draft |
| frontend/app/terms/page.tsx | Terms draft; stale motor claim |
| frontend/app/layout.tsx | Root metadata/layout/service-worker registration context |
| frontend/components/LandingPage.tsx | Public marketing UI |
| frontend/components/SoyleApp.tsx | Главный product monolith и все роли/игры |
| frontend/lib/api.ts | API client, timeout, cookie credentials, CSRF |
| frontend/lib/i18n.ts | Russian-only gate |
| frontend/lib/aacGrammar.ts | Client-side grammar preview |
| frontend/lib/motorDetection.ts | Blendshape thresholds/baseline logic |
| frontend/app/globals.css | Product styles, responsive and accessibility media queries |
| frontend/app/landing.css | Landing styles |
| frontend/next.config.ts | CSP/security headers |
| frontend/public/sw.js | Network-first shell cache |
| frontend/public/aac-pictograms | 63 local AAC PNGs |
| frontend/public/mediapipe | Face model + WASM |
| frontend/public/audio | 34 currently unused MP3 |
| frontend/tests/motor-detection.test.mjs | 4 motor runtime tests |
| frontend/tests/safety-regressions.test.mjs | 7 source/regression guards |

### Локальные документы, не являющиеся источником истины

AAC_LINGUISTIC_REVIEW.md, ACCESSIBILITY_CHECKLIST.md, AUDIT_SOYLE_2026-10-07.md, EXERCISE_CONTENT_MATRIX.md, IMPLEMENTATION_ROADMAP.md, LOCALIZATION_STATUS.md и PILOT_READINESS.md находятся в .gitignore. Они содержат полезный исторический контекст, но некоторые заявления уже не совпадают с текущим кодом. Их нельзя использовать для release evidence без повторной сверки.

## 24. Verification Limitations

### 24.1 Не проверено

- Production/staging deployment и реальные URL.
- PostgreSQL startup/migrations на копии production.
- Реальные environment values; проверялись только имена переменных.
- OpenAI live calls, billing, provider retention contract и model behavior.
- Server TTS в Vercel/Linux/macOS production.
- Камера на реальных iOS/Android/tablet устройствах.
- MediaPipe accuracy на целевой аудитории.
- Screen reader, switch control, voice control и 200% scaling.
- Safari/Firefox/Edge compatibility.
- Offline behavior после service-worker update.
- Load, race, soak, chaos и concurrent sessions.
- Vulnerability scan, SBOM и license audit.
- Backup/restore и удаление из backup.
- Delivery/readiness of mailto contact/operator support.
- Правовая применимость Terms/Privacy.
- Лингвистическая корректность всех RU AAC forms.
- Любая клиническая эффективность.

### 24.2 Почему проверки ограничены

- Аудит запрещал production operations, migrations, deployment и изменения кода.
- Не использовались реальные персональные данные детей.
- OpenAI был отключён в локальной проверке.
- Production build не запускался, потому что он создаёт/изменяет .next.
- Browser smoke выполнялся на временной копии frontend и временной SQLite, а не на production.
- Автоматизированного E2E/accessibility harness в репозитории нет.

### 24.3 Что считать подтверждённым

Подтверждено:

- структура кода и текущий каталог;
- 60 route declarations и 21 table declaration;
- 35 seed exercises, 19 active/16 archived;
- 63 core AAC cards;
- фактическая role blocking;
- test/lint/dependency-check results;
- локальные parent/student flows, responsive 320 px, consent gate, free AAC и sensory retry;
- отсутствие tracked secrets.

Не подтверждено:

- production readiness;
- соответствие конкретной юрисдикции;
- accessibility conformance;
- методическая/клиническая пригодность;
- безопасность любого будущего re-enabled specialist flow;
- качество KK, потому что KK продукта нет;
- real-world outcomes.

---

## Итог для следующего планирующего ИИ

Soyle следует развивать не как набор новых экранов поверх текущего target string, а как безопасную платформу из версионируемых mechanics/content, явного функционального профиля, объяснимого planner, parent controls, заново спроектированной specialist policy и независимых language/AAC/TTS слоёв. При этом нужно сохранить уже удачные свойства: free unscored AAC, принятие отказа, разделение correctness/participation, server-side validation, local camera processing, opt-in AI и семейную изоляцию.

Первое решение следующего этапа — не «какую функцию написать», а «какие клинические, юридические и data-purpose границы утверждены». Без этого расширение каталога, AI или роли логопеда увеличит риск быстрее, чем ценность продукта.
