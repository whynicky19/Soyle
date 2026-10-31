from app.local_server import AZURE_VARIABLES, load_local_speech_settings


def test_local_speech_config_precedence_and_scope(tmp_path, monkeypatch):
    for key in AZURE_VARIABLES:
        monkeypatch.setenv(key, "")
        monkeypatch.delenv(key)
    monkeypatch.setenv("AZURE_SPEECH_REGION", "shell-region")
    monkeypatch.setenv("DATABASE_URL", "local-database")
    (tmp_path / "backend").mkdir()
    (tmp_path / ".env.local").write_text("AZURE_TTS_ENABLED=true\nAZURE_SPEECH_KEY=root-key\nAZURE_SPEECH_REGION=root-region\nDATABASE_URL=wrong-database\n")
    (tmp_path / "backend" / ".env.local").write_text("AZURE_SPEECH_KEY=backend-key\n")
    load_local_speech_settings(tmp_path)
    import os
    assert os.environ["AZURE_TTS_ENABLED"] == "true"
    assert os.environ["AZURE_SPEECH_KEY"] == "backend-key"
    assert os.environ["AZURE_SPEECH_REGION"] == "shell-region"
    assert os.environ["DATABASE_URL"] == "local-database"
