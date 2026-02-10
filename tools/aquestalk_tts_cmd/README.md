# AquesTalk TTS Cmd (local dev helper)

Local-only helper executable to convert **Japanese text** to **WAV** using:

- AqKanji2Koe (Japanese → AquesTalk phoneme string)
- AquesTalk1 (phoneme string → WAV bytes)

This is intended for **local development** / experimentation. Do not commit AquesTalk SDK files.

## Build (Windows / VS Build Tools)

From a **Developer Command Prompt for VS 2022**:

```bat
cd /d D:\souce\Project-Sigmaris\tools\aquestalk_tts_cmd
build.cmd
```

Output:

- `tools\aquestalk_tts_cmd\bin\x64\Release\aquestalk_tts_cmd.exe`

## Run

```bat
chcp 65001
echo こんにちは。 | tools\aquestalk_tts_cmd\bin\x64\Release\aquestalk_tts_cmd.exe --voice f1 --encoding utf8 --speed 100 --out out.wav
```

If `--out` is omitted, the tool creates a temp WAV file and prints its path to stdout.

Notes:

- If you feed text from classic `cmd.exe`, use `chcp 65001` for UTF-8 or `--encoding sjis` with `chcp 932`.
- PowerShell piping can alter encodings; prefer `cmd.exe` for quick manual tests.

## SDK layout assumption

The tool auto-detects the repo-local SDK folder by walking up from the exe directory and looking for:

- `aquestalk\aqk2k_win_413\aqk2k_win\lib64\AqKanji2Koe.dll`
- `aquestalk\aqk2k_win_413\aqk2k_win\aq_dic\`
- `aquestalk\aqtk1_win_200\aqtk1_win\lib64\<voice>\AquesTalk.dll` (voice defaults to `f1`)

You can override the root directory:

```bat
aquestalk_tts_cmd.exe --aquestalk-root D:\souce\Project-Sigmaris\aquestalk ...
```
