"""Reviewed, deterministic interactive stories. Choices never depend on a model."""

def choice(key: str, label: str, pictogram: str) -> dict:
    designed = {"help": "/app-illustrations/aac-help.webp", "water": "/app-illustrations/aac-water.webp", "stop": "/app-illustrations/aac-stop.webp", "break": "/app-illustrations/aac-break.webp", "teddy": "/app-illustrations/aac-teddy.webp", "train": "/app-illustrations/aac-train.webp", "apple": "/app-illustrations/aac-apple.webp", "banana": "/app-illustrations/aac-banana.webp"}
    return {"key": key, "label": label, "image": designed.get(pictogram, f"/aac-pictograms/{pictogram}.png")}


STORIES = {
    "park": {
        "title": "На прогулке",
        "summary": "Миша и Рыжик ищут помощь и воду в парке.",
        "cover": "/app-illustrations/story-park-kite.webp",
        "category": "Просьбы",
        "scenes": [
            {"image": "/app-illustrations/story-park-intro.webp", "alt": "Воздушный змей застрял на ветке, Миша и собака смотрят на него", "text": "Миша гуляет с Рыжиком. Ветер поднял змей высоко, и тот зацепился за ветку. Что Миша может сказать взрослому?", "prompt": "Выбери сообщение", "choices": [choice("help", "Помоги", "help"), choice("sleep", "Спать", "sleep")], "answer": "help", "hint": "Можно попросить взрослого помочь со змеем."},
            {"image": "/app-illustrations/story-park-choice.webp", "alt": "У фонтана Миша смотрит на пустую бутылку, рядом ждёт Рыжик", "text": "Мама помогла снять змей. После игры Миша заметил, что бутылка пуста. Что ему сейчас нужно?", "prompt": "Выбери нужное", "choices": [choice("water", "Вода", "water"), choice("ball", "Мяч", "ball")], "answer": "water", "hint": "Посмотри на пустую бутылку: Мише хочется пить."},
            {"image": "/app-illustrations/story-park-finish.webp", "alt": "Миша с мамой и Рыжиком отдыхают на пледе после прогулки", "text": "Мама налила воду. Миша попил, Рыжик тоже отдохнул. Какое занятие они только что закончили?", "prompt": "Выбери действие", "choices": [choice("walk", "Гулять", "walk"), choice("read", "Читать", "read")], "answer": "walk", "hint": "Они гуляли в парке."},
        ],
    },
    "bedtime": {
        "title": "Собираемся спать",
        "summary": "Тихий вечер, любимый мишка и книга перед сном.",
        "cover": "/app-illustrations/story-bedtime-bear.webp",
        "category": "Быт",
        "scenes": [
            {"image": "/app-illustrations/story-bedtime-intro.webp", "alt": "Миша складывает игрушки в коробку перед сном", "text": "Вечер. Миша складывает игрушки и готовит комнату ко сну. Что будет дальше?", "prompt": "Выбери действие", "choices": [choice("sleep", "Спать", "sleep"), choice("walk", "Гулять", "walk")], "answer": "sleep", "hint": "Наступил вечер, скоро пора спать."},
            {"image": "/app-illustrations/story-bedtime-choice.webp", "alt": "Миша выбирает мишку и книгу у полки возле кровати", "text": "Миша хочет взять с собой любимую игрушку. Рядом с книгой сидит мягкий мишка. Что он возьмёт?", "prompt": "Выбери предмет", "choices": [choice("teddy", "Мишку", "teddy"), choice("ball", "Мяч", "ball")], "answer": "teddy", "hint": "Посмотри на мягкую игрушку рядом с книгой."},
            {"image": "/app-illustrations/story-bedtime-finish.webp", "alt": "Миша читает с мамой в кровати, а мишка сидит рядом", "text": "Мама пришла пожелать спокойной ночи. Миша показывает ей книгу. Что они делают вместе?", "prompt": "Выбери действие", "choices": [choice("read", "Читать", "read"), choice("eat", "Кушать", "eat")], "answer": "read", "hint": "Они смотрят книгу перед сном."},
        ],
    },
    "meal": {
        "title": "Идём кушать",
        "summary": "Миша выбирает еду и просит то, что ему нравится.",
        "cover": "/app-illustrations/story-mealtime-choice.webp",
        "category": "Просьбы",
        "scenes": [
            {"image": "/app-illustrations/story-meal-intro.webp", "alt": "На кухне Миша видит яблоки и бананы на столе", "text": "На кухне пахнет вкусным обедом. Миша увидел фрукты и хочет выбрать. Как он может начать просьбу?", "prompt": "Выбери сообщение", "choices": [choice("want", "Хочу", "want"), choice("no", "Нет", "no")], "answer": "want", "hint": "Миша хочет попросить фрукт."},
            {"image": "/app-illustrations/story-meal-choice.webp", "alt": "Миша показывает маме на ломтики яблока на кухне", "text": "Мама предлагает два фрукта. Миша показывает на красные дольки. Что он выбрал?", "prompt": "Выбери фрукт", "choices": [choice("apple", "Яблоко", "apple"), choice("banana", "Банан", "banana")], "answer": "apple", "hint": "Красные дольки — это яблоко."},
            {"image": "/app-illustrations/story-meal-finish.webp", "alt": "Миша ест яблоко за кухонным столом, мишка сидит рядом", "text": "Теперь яблоко лежит на тарелке. Миша ест, а мишка сидит рядом. Что Миша делает?", "prompt": "Выбери действие", "choices": [choice("eat", "Кушать", "eat"), choice("sleep", "Спать", "sleep")], "answer": "eat", "hint": "Миша ест яблоко."},
        ],
    },
    "toy": {
        "title": "Любимая игрушка",
        "summary": "Миша выбирает игрушку и приглашает друга играть.",
        "cover": "/app-illustrations/story-blanket-train.webp",
        "category": "Игры",
        "scenes": [
            {"image": "/app-illustrations/story-toy-intro.webp", "alt": "Миша заходит в игровую комнату с игрушками и железной дорогой", "text": "В игровой комнате много игрушек. Миша хочет начать игру с другом. Какое слово подойдёт?", "prompt": "Выбери действие", "choices": [choice("play", "Играть", "play"), choice("sleep", "Спать", "sleep")], "answer": "play", "hint": "Миша пришёл поиграть."},
            {"image": "/app-illustrations/story-toy-choice.webp", "alt": "Миша выбирает между поездом и мягким мишкой у полки", "text": "На полке лежат поезд и мишка. Друг принёс железную дорогу. Что нужно для этой игры?", "prompt": "Выбери игрушку", "choices": [choice("train", "Поезд", "train"), choice("bear", "Мишка", "teddy")], "answer": "train", "hint": "Для железной дороги нужен поезд."},
            {"image": "/app-illustrations/story-toy-finish.webp", "alt": "Миша и друг вместе строят дорогу, мишка наблюдает с кресла", "text": "Миша и друг построили длинную дорогу и играют вместе. Как Миша себя чувствует?", "prompt": "Выбери чувство", "choices": [choice("happy", "Весело", "happy"), choice("sad", "Грустно", "sad")], "answer": "happy", "hint": "Они улыбаются и радуются игре."},
        ],
    },
}


def public_story(key: str, story: dict, progress: dict | None = None) -> dict:
    progress = progress or {}
    return {
        "key": key,
        "title": story["title"],
        "summary": story["summary"],
        "cover": story["cover"],
        "category": story["category"],
        "scene_count": len(story["scenes"]),
        "scene_index": progress.get("scene_index", 0),
        "completed_at": progress.get("completed_at"),
        "scenes": [{field: value for field, value in scene.items() if field != "answer"} for scene in story["scenes"]],
    }
