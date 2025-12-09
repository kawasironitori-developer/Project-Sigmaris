#!/usr/bin/env python
"""
sigmaris-core 以下のすべての .py ファイルを集約し、
1万行ごとに分割してテキストファイルとして書き出すツール。

出力ファイル名:
    sigmaris_core_dump_part_1.txt
    sigmaris_core_dump_part_2.txt
    ...
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import List

# 1ファイルあたりの最大行数
MAX_LINES_PER_FILE = 10_000

# 収集対象ディレクトリ名（このスクリプトと同じ階層にある前提）
TARGET_DIR_NAME = "sigmaris-core"


def collect_python_files(root: Path) -> List[Path]:
    """root 以下の .py ファイルをすべて再帰的に集めてソートして返す。"""
    files: List[Path] = []
    for dirpath, dirnames, filenames in os.walk(root):
        # __pycache__ は無視
        dirpath_p = Path(dirpath)
        if dirpath_p.name == "__pycache__":
            continue

        for filename in filenames:
            if not filename.endswith(".py"):
                continue
            full_path = dirpath_p / filename
            files.append(full_path)

    # 安定した順序で出力したいのでソート
    files.sort()
    return files


def build_aggregated_lines(files: List[Path], root: Path) -> List[str]:
    """
    ファイル群から、ヘッダ付きのテキスト行リストを組み立てる。
    """
    lines: List[str] = []

    for path in files:
        # root からの相対パスをヘッダに使う
        rel_path = path.relative_to(root.parent)  # 例: sigmaris-core/aei/...
        header = f"=== FILE: {rel_path.as_posix()} ==="
        lines.append(header)
        lines.append("")  # 空行で区切る

        try:
            with path.open("r", encoding="utf-8") as f:
                file_contents = f.read()
        except UnicodeDecodeError:
            # もしエンコーディング問題があれば、バイナリ読み＋代替表示にしてもよいが
            # ここでは単純にスキップする。
            lines.append("# [WARN] Could not decode this file as UTF-8.")
            lines.append("")
            continue

        # ファイル内容を行単位で追加
        file_lines = file_contents.splitlines()
        lines.extend(file_lines)
        lines.append("")  # ファイル末尾にも空行

    return lines


def write_split_files(all_lines: List[str], output_prefix: str = "sigmaris_core_dump_part_") -> None:
    """
    行リストを MAX_LINES_PER_FILE ごとに分割してテキストファイルへ書き出す。
    """
    if not all_lines:
        print("No lines to write. Nothing will be exported.")
        return

    total_lines = len(all_lines)
    part_idx = 1
    start = 0

    while start < total_lines:
        end = min(start + MAX_LINES_PER_FILE, total_lines)
        chunk = all_lines[start:end]

        out_name = f"{output_prefix}{part_idx}.txt"
        with open(out_name, "w", encoding="utf-8", newline="\n") as f:
            f.write("\n".join(chunk))

        print(f"Wrote {out_name} ({len(chunk)} lines)")
        part_idx += 1
        start = end


def main() -> None:
    here = Path(__file__).resolve().parent
    target_root = here / TARGET_DIR_NAME

    if not target_root.exists() or not target_root.is_dir():
        print(f"[ERROR] Target directory not found: {target_root}")
        return

    print(f"Collecting .py files under: {target_root}")

    files = collect_python_files(target_root)
    print(f"Found {len(files)} Python files.")

    if not files:
        print("No Python files found. Exiting.")
        return

    all_lines = build_aggregated_lines(files, target_root)
    print(f"Total lines to write (including headers): {len(all_lines)}")

    write_split_files(all_lines)


if __name__ == "__main__":
    main()
