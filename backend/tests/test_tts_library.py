import wave
from array import array

from app.tts_library import bundled_tts_path, known_russian_tts_texts


def test_all_builtin_speech_has_a_click_safe_bundled_clip():
    missing = [text for text in known_russian_tts_texts() if not bundled_tts_path(text).exists()]
    assert missing == []

    for text in known_russian_tts_texts():
        with wave.open(str(bundled_tts_path(text)), "rb") as audio:
            samples = array("h", audio.readframes(audio.getnframes()))
            assert samples and max(abs(sample) for sample in samples) >= 500, text
            frame_count = min(audio.getnframes(), max(1, audio.getframerate() // 20))
            audio.setpos(audio.getnframes() - frame_count)
            assert set(audio.readframes(frame_count)) <= {0}, text
