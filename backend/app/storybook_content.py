"""Versioned storybook source. Unreviewed content is never served to students."""

from copy import deepcopy

FAVORITE_TOY = {
    "key": "toy", "version": 1, "schema_version": 1, "status": "PUBLISHED", "review_status": "approved",
    "title": "Любимая игрушка — живая история", "subtitle": "Маленькая история о большой помощи",
    "approval": {"administrator": "approved"},
    "publication": {"approved_by": "project_owner", "date": "2026-10-25", "model": "administrator_review"},
    "summary": "Найти мишку, попросить помощь и придумать свою игру вместе с Мишей.",
    "age_note": "Можно читать вместе со взрослым, нажимать на предметы и выбирать карточки. Устный ответ не обязателен.",
    "review_note": "Опубликовано по решению владельца проекта после технической проверки. Подготовлено AI; это не заключение профильного специалиста. Предпросмотр взрослого хранится отдельно.",
    "assets": {"room": "/storybooks/favorite-toy/room.webp", "misha": "/storybooks/favorite-toy/misha-atlas.webp", "mother": "/storybooks/favorite-toy/mother-standing.webp", "objects": "/storybooks/favorite-toy/objects-atlas.webp"},
    "characters": {"misha": {"name": "Миша", "outfit": "Бирюзовая футболка, кремовые шорты, охристые носки"}, "mother": {"name": "Мама", "outfit": "Коралловый кардиган, кремовая блуза, тёмно-бирюзовые брюки"}},
    "scenes": [
        {"id": "hello", "title": "Давай поиграем", "kind": "choose_object", "narration": "Это Миша. Он хочет поиграть. С какой игрушки начнём?", "instruction": "Нажми на любую игрушку", "hint": "Можно выбрать мяч, поезд или мишку. Любой выбор подойдёт.", "completion": "choose_any", "background": "room", "camera": "wide", "lighting": "morning", "misha_pose": 0,
         "actions": [{"key": "choose_ball", "label": "Мяч", "object": "ball", "reaction": "Мяч! Миша любит катать мяч."}, {"key": "choose_train", "label": "Поезд", "object": "train", "reaction": "Поезд! Он может поехать по ковру."}, {"key": "choose_teddy", "label": "Мишка", "object": "teddy", "reaction": "Мишка! Миша хочет взять его с собой."}],
         "assisted_reaction": "Можно посмотреть вместе. Миша готов найти любимого мишку.", "transition": "dissolve"},
        {"id": "find", "title": "Где мишка?", "kind": "tap_object", "narration": "Миша ищет любимого мишку. Посмотри: мишка сидит на полке.", "instruction": "Найди мишку в комнате", "hint": "Посмотри на правую полку. У мишки бирюзовый бантик.", "completion": "tap_teddy", "background": "room", "camera": "shelf", "lighting": "morning", "misha_pose": 0,
         "actions": [{"key": "find_teddy", "label": "Нашёл мишку", "object": "teddy", "reaction": "Вот он! Мишка сидит высоко."}, {"key": "explore_train", "label": "Посмотреть поезд", "object": "train", "reaction": "Это поезд. А мишка ждёт на полке."}, {"key": "explore_ball", "label": "Посмотреть мяч", "object": "ball", "reaction": "Это мяч. Мишка сидит чуть выше."}],
         "assisted_reaction": "Мы нашли мишку вместе. Он на правой полке.", "transition": "focus"},
        {"id": "request", "title": "Позовём на помощь", "kind": "aac_request", "narration": "Мишка высоко. Миша не может достать его. Можно попросить маму о помощи.", "instruction": "Помоги Мише попросить", "hint": "Можно нажать «Помоги», «Дай мишку» или показать на мишку. Говорить вслух не нужно.", "completion": "communicate", "background": "room", "camera": "reach", "lighting": "morning", "misha_pose": 1,
         "actions": [{"key": "request_help", "label": "Помоги", "speech": "Мама, помоги", "object": "mother", "reaction": "Мама услышала просьбу. Сейчас она подойдёт."}, {"key": "request_teddy", "label": "Дай мишку", "speech": "Мама, дай мишку, пожалуйста", "object": "teddy", "reaction": "Миша попросил мишку. Мама поможет."}, {"key": "request_point", "label": "Показать на мишку", "speech": "Мишка на полке", "object": "misha", "reaction": "Миша показал на мишку. Мама поняла."}],
         "assisted_reaction": "Взрослый помог выразить просьбу. Мама идёт к полке.", "transition": "dissolve"},
        {"id": "help", "title": "Мама рядом", "kind": "give_object", "narration": "Мама подошла к полке. Сначала возьмём мишку. Потом передадим его Мише.", "instruction": "Нажми на мишку, затем на Мишу", "hint": "Сначала нажми на мишку на полке. Когда он окажется у мамы, нажми на Мишу.", "completion": "take_then_give", "background": "room", "camera": "together", "lighting": "morning", "misha_pose": 2,
         "actions": [{"key": "take_teddy", "label": "Взять мишку с полки", "object": "teddy", "reaction": "Мишка у мамы. Теперь передадим его Мише."}, {"key": "give_misha", "label": "Передать мишку Мише", "object": "misha", "reaction": "Миша получил мишку. Спасибо за помощь!"}],
         "assisted_reaction": "Мы помогли вместе. Мишка теперь у Миши.", "transition": "dissolve"},
        {"id": "play", "title": "Наша игра", "kind": "simple_sequence", "narration": "Миша и мишка снова вместе. Можно обнять мишку или покатать игрушку рядом с ним.", "instruction": "Выбери, как поиграть", "hint": "Можно обнять мишку или покатать выбранную игрушку. Потом вернём её на ковёр.", "completion": "play_then_rest", "background": "room", "camera": "rug", "lighting": "warm", "misha_pose": 3,
         "actions": [{"key": "play_hug", "label": "Обнять мишку", "object": "teddy", "reaction": "Миша обнимает мишку. Тихо и уютно."}, {"key": "play_roll", "label": "Покатать игрушку", "object": "chosen", "reaction": "Игрушка едет по ковру. Мишка смотрит рядом."}, {"key": "settle", "label": "Положить рядом", "object": "basket", "reaction": "Положим игрушку рядом. Можно отдохнуть."}],
         "assisted_reaction": "Мы немного поиграли вместе. Теперь игрушки отдыхают рядом.", "transition": "warm_fade"},
        {"id": "finish", "title": "Хорошо быть вместе", "kind": "watch", "narration": "Мишка рядом. Мама помогла. Теперь можно ещё немного посидеть или закончить историю.", "instruction": "Можно спокойно закончить", "hint": "Здесь ничего не нужно угадывать. Можно послушать ещё раз или закончить.", "completion": "observe", "background": "room", "camera": "closing", "lighting": "warm", "misha_pose": 3, "actions": [],
         "assisted_reaction": "Историю можно закончить в удобный момент.", "transition": "warm_fade"},
    ],
}

# Spatial authoring is content, not a switch hidden inside the renderer.
_BASE_LAYERS = {
    "misha": {"x": 31, "y": 32, "width": 30, "height": 58, "pose": 0, "z": 4},
    "mother": {"x": 72, "y": 15, "width": 30, "height": 79, "pose": 0, "visible": False, "z": 3},
    "teddy": {"x": 79, "y": 13, "width": 15, "height": 23, "z": 5},
    "train": {"x": 13, "y": 69, "width": 23, "height": 24, "z": 6},
    "ball": {"x": 57, "y": 73, "width": 16, "height": 22, "z": 6},
    "basket": {"x": 5, "y": 44, "width": 21, "height": 24, "z": 2},
}
for scene in FAVORITE_TOY["scenes"]:
    scene["status"] = "PUBLISHED"
    scene["review_status"] = "approved"
    scene["layers"] = deepcopy(_BASE_LAYERS)
    scene["layer_reactions"] = []
    scene["decorative_motion"] = ["daylight"]

FAVORITE_TOY["scenes"][1]["layers"]["misha"].update(x=35, y=32, width=31, height=60)
FAVORITE_TOY["scenes"][2]["layers"]["misha"].update(x=42, y=28, width=32, height=65, pose=1)
FAVORITE_TOY["scenes"][2]["decorative_motion"].append("reach")
_help = FAVORITE_TOY["scenes"][3]
_help["layers"]["misha"].update(x=21, y=36, width=30, height=58, pose=2)
_help["layers"]["mother"].update(x=55, y=13, width=32, height=82, pose=1, visible=True, z=4)
_help["layer_reactions"] = [
    {"when": {"step": 1}, "layers": {"mother": {"pose": 2}, "teddy": {"x": 56, "y": 45, "width": 17, "height": 25, "z": 7}}},
    {"when": {"step": 2}, "layers": {"mother": {"pose": 2}, "teddy": {"x": 34, "y": 51, "width": 17, "height": 25, "z": 7}}},
]
for scene in FAVORITE_TOY["scenes"][4:]:
    scene["layers"]["misha"].update(x=27, y=46, width=35, height=49, pose=3, z=5)
    scene["layers"]["mother"].update(x=61, y=39, width=28, height=55, pose=3, visible=True)
    scene["layers"]["teddy"].update(x=49, y=67, width=18, height=26, z=7)
    scene["layers"]["train"].update(x=10, y=74, width=22, height=20)
    scene["layers"]["ball"].update(x=72, y=75, width=16, height=21)
    scene["layers"]["basket"].update(x=7, y=48, width=20, height=24)
FAVORITE_TOY["scenes"][4]["layer_reactions"] = [
    {"when": {"play": "hug", "step": 1}, "layers": {"teddy": {"x": 40, "y": 59}}},
    {"when": {"play": "roll", "step": 1}, "layers": {"chosen": {"x": 53, "y": 78, "width": 20, "height": 20, "z": 7}}},
]
FAVORITE_TOY["environment"] = {"room_id": "misha-room-01", "window": "left", "shelf": "right", "teddy_shelf_anchor": {"x": 86, "y": 36}, "rug": "center foreground", "time": "one morning", "palette": ["#fbf8f1", "#087f7c", "#e79374", "#123b60"]}

FAVORITE_TOY["scenes"][0]["layer_reactions"] = [{"when": {"ready": True}, "layers": {"misha": {"pose": 2}}}]

FAVORITE_TOY["frames"] = {"mother": [FAVORITE_TOY["assets"]["mother"], "/storybooks/favorite-toy/mother-reaching.webp", "/storybooks/favorite-toy/mother-giving.webp", "/storybooks/favorite-toy/mother-seated.webp"]}

# The last page is its own quiet composition, with the family gathered closer.
_closing = FAVORITE_TOY["scenes"][5]["layers"]
_closing["misha"].update(x=34, y=45, width=34, height=49)
_closing["mother"].update(x=61, y=41, width=27, height=54)
_closing["teddy"].update(x=47, y=65, width=17, height=25)
_closing["train"].update(x=12, y=80, width=18, height=17)
_closing["ball"].update(x=77, y=78, width=13, height=18)
