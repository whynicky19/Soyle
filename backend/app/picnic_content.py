"""A published comic, played by the existing interactive-book engine."""
from hashlib import sha256
ROOT = "/learning-core/picnic"


def option(key, label, image, feedback, **extra):
    return {"key": key, "label": label, "art": "teddy", "image": image, "feedback": feedback, **extra}


def scene(key, title, narration, kind="watch", **extra):
    return {"id": key, "title": title, "narration": narration, "kind": kind,
            "instruction": narration, "hint": "Можно повторить реплику, попросить помощь или сделать перерыв.",
            "image": f"{ROOT}/{key}.webp", "alt": title, "options": [], "hotspots": [], **extra}


PICNIC = {
    "key": "picnic", "version": 1, "schema_version": 1, "status": "PUBLISHED", "review_status": "approved",
    "approval": {"administrator": "approved"},
    "publication": {"approved_by": "project_owner", "date": "2026-10-25", "model": "administrator_review"},
    "title": "Пикник для мишки", "subtitle": "Выбираем, просим и играем вместе",
    "review_note": "Опубликовано по решению владельца проекта после технической проверки. Сюжет и изображения подготовлены AI; это не заключение профильного специалиста.",
    "assets_manifest": f"{ROOT}/manifest.json", "audio": {"status": "ready", "clips": {}},
    "scenes": [
        scene("01", "Мишка идёт на пикник", "Миша зовёт мишку на пикник. Мама идёт с ними."),
        scene("02", "Что возьмём для игры?", "Что возьмём для игры: мяч или книгу?", "choice", personal_choice=True, options=[
            option("ball", "Мяч", "/learning-core/words/ball-a.webp", "Возьмём мяч. В парке будем катать его вместе."),
            option("book", "Книга", f"{ROOT}/objects/book.webp", "Возьмём книгу. В парке посмотрим картинки вместе.")]),
        scene("03", "Стакан для воды", "Положи стакан в сумку.", "instruction", language_steps=1, sequence_steps=["cup", "bag"], result_image=f"{ROOT}/04.webp", options=[
            option("cup", "Стакан", f"{ROOT}/objects/cup.webp", "Стакан у нас. Теперь нажми на сумку."),
            option("bag", "В сумку", f"{ROOT}/objects/bag.webp", "Стакан в сумке. Вода будет рядом.")]),
        scene("04", "Корзина закрыта", "Корзина закрыта. Можно попросить помочь.", "choice", options=[
            option("help", "Помоги", "/app-illustrations/aac-help.webp", "Мама поняла просьбу. Сейчас она откроет корзину.", speech="Помоги"),
            option("point", "Показать на корзину", f"{ROOT}/04.webp", "Миша показал на корзину. Мама поняла.")]),
        scene("05", "Мама помогает", "Мама открыла корзину. Теперь можно идти."),
        scene("06", "Дорога в парк", "Все идут в парк. Сумка и корзина с ними."),
        scene("07-ball", "Играем вместе", "Вот наша игрушка. Можно играть вместе.", image_by_choice={"scene": "02", "images": {"ball": f"{ROOT}/07-ball.webp", "book": f"{ROOT}/07-book.webp"}, "narrations": {"ball": "Миша катает мяч. Мама ловит мяч.", "book": "Миша и мама смотрят книгу. Мишка рядом."}}),
        scene("08", "Какой фрукт выберешь?", "Мама предлагает яблоко и банан. Какой фрукт ты выберешь?", "choice", personal_choice=True, options=[
            option("apple", "Яблоко", f"{ROOT}/objects/apple.webp", "Ты выбрал яблоко. Мама передала его Мише.", result_image=f"{ROOT}/08-apple.webp"),
            option("banana", "Банан", f"{ROOT}/objects/banana.webp", "Ты выбрал банан. Мама передала его Мише.", result_image=f"{ROOT}/08-banana.webp")]),
        scene("09", "Можно попить и отдохнуть", "После игры Миша пьёт воду. Мишка отдыхает рядом."),
        scene("10", "Соберём наши вещи", "Возьми стакан. Потом положи его в сумку.", "instruction", language_steps=2, image=f"{ROOT}/10-before.webp", step_images={1: f"{ROOT}/10.webp"}, sequence_steps=["cup", "bag"], result_image=f"{ROOT}/10-packed.webp", options=[
            option("cup", "Стакан", f"{ROOT}/objects/cup.webp", "Взяли стакан. Теперь положим его в сумку."),
            option("bag", "В сумку", f"{ROOT}/objects/bag.webp", "Стакан в сумке. Все вещи с нами.")]),
        scene("11", "Возвращаемся домой", "Сначала собрали сумку. Потом гуляли. Теперь идём домой."),
        scene("12", "Пикник закончился", "Пикник закончился. Можно отдохнуть.", "ending"),
    ],
    "measurement_note": "Просмотр, выбор, выполнение показанного действия и помощь — разные события. Ни одно не является клинической оценкой понимания. Выборы игрушки и еды не имеют неправильного ответа. Просьба по предложению не считается спонтанной инициативой.",
    "home_transfer": "Положите безопасный стакан в сумку вместе с ребёнком. Примите жест, касание, слово или AAC. Не удерживайте воду ради просьбы. Отметьте помощь отдельно от просмотра книги.",
}

_audio_texts = {item["narration"] for item in PICNIC["scenes"]}
_audio_texts.update(text for item in PICNIC["scenes"] for text in item.get("image_by_choice", {}).get("narrations", {}).values())
_audio_texts.update(option.get("speech") or option["feedback"] for item in PICNIC["scenes"] for option in item["options"])
_audio_texts.update(f"Пикник закончился. Можно отдохнуть. Ты выбрал: {toy}, {fruit}." for toy in ("Мяч", "Книга") for fruit in ("Яблоко", "Банан"))
PICNIC["audio"] = {"status": "generated_unreviewed", "voice": "Milena", "source": "local_synthesis", "clips": {text: f"{ROOT}/audio/{sha256(text.encode()).hexdigest()[:16]}.wav" for text in sorted(_audio_texts)}}
