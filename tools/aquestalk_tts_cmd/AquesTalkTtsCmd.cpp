#define WIN32_LEAN_AND_MEAN
#include <Windows.h>

#include <cstdio>
#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <optional>
#include <sstream>
#include <string>
#include <string_view>
#include <vector>

namespace fs = std::filesystem;

static std::wstring widen_utf8(std::string_view s) {
  if (s.empty()) return L"";
  int size_needed = MultiByteToWideChar(CP_UTF8, 0, s.data(), (int)s.size(), NULL, 0);
  std::wstring w(size_needed, 0);
  MultiByteToWideChar(CP_UTF8, 0, s.data(), (int)s.size(), w.data(), size_needed);
  return w;
}

static std::string utf8_from_wide(std::wstring_view w) {
  if (w.empty()) return "";
  int size_needed = WideCharToMultiByte(CP_UTF8, 0, w.data(), (int)w.size(), NULL, 0, NULL, NULL);
  std::string s(size_needed, 0);
  WideCharToMultiByte(CP_UTF8, 0, w.data(), (int)w.size(), s.data(), size_needed, NULL, NULL);
  return s;
}

static std::string utf8_path(const fs::path &p) {
  return utf8_from_wide(p.wstring());
}

static std::string read_all_stdin() {
  std::ostringstream oss;
  oss << std::cin.rdbuf();
  return oss.str();
}

static std::string trim(std::string s) {
  auto is_space = [](unsigned char c) { return c == ' ' || c == '\t' || c == '\r' || c == '\n'; };
  while (!s.empty() && is_space((unsigned char)s.front())) s.erase(s.begin());
  while (!s.empty() && is_space((unsigned char)s.back())) s.pop_back();
  return s;
}

static std::vector<std::string> split_lines(const std::string &s) {
  std::vector<std::string> out;
  std::string cur;
  cur.reserve(s.size());
  for (char c : s) {
    if (c == '\r') continue;
    if (c == '\n') {
      out.push_back(cur);
      cur.clear();
      continue;
    }
    cur.push_back(c);
  }
  out.push_back(cur);
  return out;
}

static fs::path exe_dir() {
  wchar_t buf[MAX_PATH];
  DWORD len = GetModuleFileNameW(NULL, buf, MAX_PATH);
  if (len == 0) return fs::current_path();
  fs::path p(buf);
  return p.parent_path();
}

static std::optional<fs::path> find_aquestalk_root_from(fs::path start) {
  fs::path p = start;
  for (int i = 0; i < 6; i++) {
    fs::path candidate = p / "aquestalk";
    if (fs::exists(candidate)) return candidate;
    if (!p.has_parent_path()) break;
    p = p.parent_path();
  }
  return std::nullopt;
}

// ----------------------------
// AqKanji2Koe dynamic API
// ----------------------------

using AqKanji2Koe_Create_Fn = void *(__stdcall *)(const char *pathDic, int *pErr);
using AqKanji2Koe_Release_Fn = void(__stdcall *)(void *h);
using AqKanji2Koe_Convert_utf8_Fn = int(__stdcall *)(void *h, const char *kanji, char *koe, int nBufKoe);
using AqKanji2Koe_Convert_sjis_Fn = int(__stdcall *)(void *h, const char *kanji, char *koe, int nBufKoe);
using AqKanji2Koe_SetDevKey_Fn = int(__stdcall *)(const char *devKey);

struct AqKanji2KoeApi {
  HMODULE mod{nullptr};
  AqKanji2Koe_Create_Fn Create{nullptr};
  AqKanji2Koe_Release_Fn Release{nullptr};
  AqKanji2Koe_Convert_utf8_Fn ConvertUtf8{nullptr};
  AqKanji2Koe_Convert_sjis_Fn ConvertSjis{nullptr};
  AqKanji2Koe_SetDevKey_Fn SetDevKey{nullptr};
};

static std::optional<AqKanji2KoeApi> load_kanji2koe(const fs::path &dll_path) {
  AqKanji2KoeApi api;
  api.mod = LoadLibraryW(dll_path.wstring().c_str());
  if (!api.mod) return std::nullopt;

  api.Create = (AqKanji2Koe_Create_Fn)GetProcAddress(api.mod, "AqKanji2Koe_Create");
  api.Release = (AqKanji2Koe_Release_Fn)GetProcAddress(api.mod, "AqKanji2Koe_Release");
  api.ConvertUtf8 = (AqKanji2Koe_Convert_utf8_Fn)GetProcAddress(api.mod, "AqKanji2Koe_Convert_utf8");
  api.ConvertSjis = (AqKanji2Koe_Convert_sjis_Fn)GetProcAddress(api.mod, "AqKanji2Koe_Convert_sjis");
  api.SetDevKey = (AqKanji2Koe_SetDevKey_Fn)GetProcAddress(api.mod, "AqKanji2Koe_SetDevKey");

  if (!api.Create || !api.Release || !api.ConvertUtf8 || !api.ConvertSjis || !api.SetDevKey) {
    FreeLibrary(api.mod);
    return std::nullopt;
  }
  return api;
}

// ----------------------------
// AquesTalk dynamic API
// ----------------------------

using AquesTalk_Synthe_Fn = unsigned char *(__stdcall *)(const char *koe, int iSpeed, int *pSize);
using AquesTalk_Synthe_Utf8_Fn = unsigned char *(__stdcall *)(const char *koe, int iSpeed, int *pSize);
using AquesTalk_FreeWave_Fn = void(__stdcall *)(unsigned char *wav);
using AquesTalk_SetDevKey_Fn = int(__stdcall *)(const char *key);
using AquesTalk_SetUsrKey_Fn = int(__stdcall *)(const char *key);

struct AquesTalkApi {
  HMODULE mod{nullptr};
  AquesTalk_Synthe_Fn Synthe{nullptr};
  AquesTalk_Synthe_Utf8_Fn SyntheUtf8{nullptr};
  AquesTalk_FreeWave_Fn FreeWave{nullptr};
  AquesTalk_SetDevKey_Fn SetDevKey{nullptr};
  AquesTalk_SetUsrKey_Fn SetUsrKey{nullptr};
};

static std::optional<AquesTalkApi> load_aquestalk(const fs::path &dll_path) {
  AquesTalkApi api;
  api.mod = LoadLibraryW(dll_path.wstring().c_str());
  if (!api.mod) return std::nullopt;

  api.Synthe = (AquesTalk_Synthe_Fn)GetProcAddress(api.mod, "AquesTalk_Synthe");
  api.SyntheUtf8 = (AquesTalk_Synthe_Utf8_Fn)GetProcAddress(api.mod, "AquesTalk_Synthe_Utf8");
  api.FreeWave = (AquesTalk_FreeWave_Fn)GetProcAddress(api.mod, "AquesTalk_FreeWave");
  api.SetDevKey = (AquesTalk_SetDevKey_Fn)GetProcAddress(api.mod, "AquesTalk_SetDevKey");
  api.SetUsrKey = (AquesTalk_SetUsrKey_Fn)GetProcAddress(api.mod, "AquesTalk_SetUsrKey");

  if (!api.Synthe || !api.SyntheUtf8 || !api.FreeWave || !api.SetDevKey || !api.SetUsrKey) {
    FreeLibrary(api.mod);
    return std::nullopt;
  }
  return api;
}

static void usage() {
  std::cerr
      << "aquestalk_tts_cmd\n"
      << "  Reads UTF-8 text from stdin and outputs a WAV file using AqKanji2Koe + AquesTalk1.\n\n"
      << "Usage:\n"
      << "  echo こんにちは | aquestalk_tts_cmd.exe --out out.wav\n\n"
      << "Options:\n"
      << "  --aquestalk-root <path>   Root folder containing aqtk1_win_200/ and aqk2k_win_413/ (default: auto-detect)\n"
      << "  --voice <id>              Voice folder under aqtk1_win_200/.../lib64 (default: f1)\n"
      << "  --speed <50..300>         Speech speed percent (default: 100)\n"
      << "  --out <path>              Output wav path (default: temp file)\n"
      << "  --encoding <utf8|sjis>    Stdin text encoding (default: utf8)\n"
      << "  --dev-key <key>           Developer license key (optional; env AQUEST_DEV_KEY also supported)\n"
      << "  --usr-key <key>           User license key (optional; env AQUEST_USR_KEY also supported)\n";
}

static std::optional<std::string> get_arg_value(const std::vector<std::string> &args, const std::string &key) {
  for (size_t i = 0; i < args.size(); i++) {
    if (args[i] == key && i + 1 < args.size()) return args[i + 1];
    if (args[i].rfind(key + "=", 0) == 0) return args[i].substr(key.size() + 1);
  }
  return std::nullopt;
}

static bool has_flag(const std::vector<std::string> &args, const std::string &key) {
  for (const auto &a : args) {
    if (a == key) return true;
  }
  return false;
}

static std::string getenv_str(const char *name) {
  char *v = nullptr;
  size_t n = 0;
  if (_dupenv_s(&v, &n, name) != 0 || !v) return "";
  std::string s(v);
  free(v);
  return s;
}

static fs::path temp_wav_path() {
  wchar_t tmp[MAX_PATH];
  DWORD n = GetTempPathW(MAX_PATH, tmp);
  if (n == 0) return exe_dir() / "out.wav";
  wchar_t file[MAX_PATH];
  if (GetTempFileNameW(tmp, L"aqt", 0, file) == 0) {
    return fs::path(tmp) / "aqt_out.wav";
  }
  fs::path p(file);
  p.replace_extension(".wav");
  return p;
}

int main(int argc, char **argv) {
  std::vector<std::string> args;
  args.reserve((size_t)argc);
  for (int i = 0; i < argc; i++) args.emplace_back(argv[i] ? argv[i] : "");

  if (has_flag(args, "--help") || has_flag(args, "-h")) {
    usage();
    return 0;
  }

  const std::string voice = get_arg_value(args, "--voice").value_or("f1");
  const std::string encoding = get_arg_value(args, "--encoding").value_or("utf8");
  const bool use_sjis = (encoding == "sjis" || encoding == "shiftjis" || encoding == "cp932");
  int speed = 100;
  if (auto s = get_arg_value(args, "--speed")) {
    try {
      speed = std::stoi(*s);
    } catch (...) {
      std::cerr << "Invalid --speed\n";
      return 2;
    }
  }
  if (speed < 50) speed = 50;
  if (speed > 300) speed = 300;

  const std::string dev_key =
      get_arg_value(args, "--dev-key").value_or(getenv_str("AQUEST_DEV_KEY"));
  const std::string usr_key =
      get_arg_value(args, "--usr-key").value_or(getenv_str("AQUEST_USR_KEY"));

  fs::path out_path;
  if (auto o = get_arg_value(args, "--out")) {
    out_path = fs::path(widen_utf8(*o));
  } else {
    out_path = temp_wav_path();
  }

  fs::path aq_root;
  if (auto r = get_arg_value(args, "--aquestalk-root")) {
    aq_root = fs::path(widen_utf8(*r));
  } else {
    auto found = find_aquestalk_root_from(exe_dir());
    if (!found) {
      std::cerr << "Could not auto-detect aquestalk root. Use --aquestalk-root.\n";
      return 2;
    }
    aq_root = *found;
  }

  const fs::path k2k_dll = aq_root / "aqk2k_win_413" / "aqk2k_win" / "lib64" / "AqKanji2Koe.dll";
  const fs::path k2k_dic = aq_root / "aqk2k_win_413" / "aqk2k_win" / "aq_dic";
  const fs::path tk_dll = aq_root / "aqtk1_win_200" / "aqtk1_win" / "lib64" / voice / "AquesTalk.dll";

  if (!fs::exists(k2k_dll) || !fs::exists(k2k_dic) || !fs::exists(tk_dll)) {
    std::cerr << "Missing SDK files:\n";
    std::cerr << "  " << utf8_path(k2k_dll) << "\n";
    std::cerr << "  " << utf8_path(k2k_dic) << "\n";
    std::cerr << "  " << utf8_path(tk_dll) << "\n";
    std::cerr << "Hint: check --aquestalk-root and --voice.\n";
    return 2;
  }

  auto k2k_api = load_kanji2koe(k2k_dll);
  if (!k2k_api) {
    std::cerr << "Failed to load AqKanji2Koe.dll\n";
    return 3;
  }
  auto tk_api = load_aquestalk(tk_dll);
  if (!tk_api) {
    std::cerr << "Failed to load AquesTalk.dll (voice=" << voice << ")\n";
    return 3;
  }

  if (!dev_key.empty()) {
    k2k_api->SetDevKey(dev_key.c_str());
    tk_api->SetDevKey(dev_key.c_str());
  }
  if (!usr_key.empty()) {
    tk_api->SetUsrKey(usr_key.c_str());
  }

  int err = 0;
  std::string dic_utf8 = utf8_path(k2k_dic);
  void *h = k2k_api->Create(dic_utf8.c_str(), &err);
  if (!h) {
    std::cerr << "AqKanji2Koe_Create failed: " << err << "\n";
    return 4;
  }

  std::string input = trim(read_all_stdin());
  if (input.empty()) {
    std::cerr << "No input text on stdin.\n";
    k2k_api->Release(h);
    return 2;
  }

  // Convert per line; join with "/" (pause separator)
  std::vector<std::string> lines = split_lines(input);
  std::string koe_all;
  for (const auto &line_raw : lines) {
    std::string line = trim(line_raw);
    if (line.empty()) continue;

    std::vector<char> koe_buf(8192);
    int rc = 0;
    if (use_sjis) {
      rc = k2k_api->ConvertSjis(h, line.c_str(), koe_buf.data(), (int)koe_buf.size());
    } else {
      rc = k2k_api->ConvertUtf8(h, line.c_str(), koe_buf.data(), (int)koe_buf.size());
    }
    if (rc != 0) {
      std::cerr << "AqKanji2Koe_Convert failed: " << rc << "\n";
      k2k_api->Release(h);
      return 4;
    }

    std::string koe_part = trim(std::string(koe_buf.data()));
    if (koe_part.empty()) continue;
    if (!koe_all.empty()) koe_all += "/";
    koe_all += koe_part;
  }

  k2k_api->Release(h);

  if (koe_all.empty()) {
    std::cerr << "Conversion produced empty koe.\n";
    return 4;
  }

  int wav_size = 0;
  unsigned char *wav = nullptr;
  if (use_sjis) {
    wav = tk_api->Synthe(koe_all.c_str(), speed, &wav_size);
  } else {
    wav = tk_api->SyntheUtf8(koe_all.c_str(), speed, &wav_size);
  }
  if (!wav || wav_size <= 0) {
    std::cerr << "AquesTalk_Synthe failed: " << wav_size << "\n";
    return 5;
  }

  try {
    fs::create_directories(out_path.parent_path());
  } catch (...) {
    // ignore
  }

  std::ofstream ofs(out_path, std::ios::binary);
  if (!ofs) {
    tk_api->FreeWave(wav);
    std::cerr << "Failed to open output file.\n";
    return 6;
  }
  ofs.write((const char *)wav, wav_size);
  ofs.close();
  tk_api->FreeWave(wav);

  std::cout << utf8_path(out_path) << "\n";
  return 0;
}
