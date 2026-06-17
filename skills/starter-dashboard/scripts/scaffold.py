#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path

APP_NAME_RE = re.compile(r"^[a-z0-9][a-z0-9._-]*$")
SUBSTITUTION_FILES = {
    Path("package.json"),
    Path("app/layout.tsx"),
    Path("README.md"),
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Scaffold a local Alpaca starter dashboard."
    )
    parser.add_argument("--target-directory", required=True)
    parser.add_argument("--app-name")
    parser.add_argument("--create-subdirectory", action="store_true")
    parser.add_argument("--key-id")
    parser.add_argument("--secret")
    parser.add_argument("--paper", default="true", choices=["true", "false"])
    parser.add_argument(
        "--allow-placeholder-credentials",
        action="store_true",
        help="Write placeholder credentials when local paper credentials are unavailable.",
    )
    return parser.parse_args()


def resolve_target(target_directory: str, app_name: str | None, create_subdirectory: bool) -> tuple[Path, str]:
    base_target = Path(target_directory).expanduser()
    if not base_target.is_absolute():
        base_target = Path.cwd() / base_target
    base_target = base_target.resolve(strict=False)

    if create_subdirectory:
        if app_name is None:
            raise ValueError("app_name is required when --create-subdirectory is set")
        return base_target / app_name, app_name

    return base_target, app_name or base_target.name


def validate_app_name(app_name: str) -> None:
    if not APP_NAME_RE.fullmatch(app_name):
        raise ValueError(
            "app_name must be a lowercase npm package name with no spaces, "
            "no uppercase letters, and no leading dot or underscore."
        )


def validate_target_directory(target: Path) -> None:
    if target.exists() and target.is_symlink():
        raise ValueError("target_directory must not be a symlink")
    if target.exists() and not target.is_dir():
        raise ValueError("target_directory exists and is not a directory")


def template_conflicts(template_root: Path, destination: Path) -> list[Path]:
    conflicts: list[Path] = []
    for source in template_root.rglob("*"):
        relative = source.relative_to(template_root)
        if source.is_dir():
            continue
        if source.is_symlink():
            raise RuntimeError(f"template contains unsupported symlink: {relative}")

        target = destination / relative
        current = destination
        for part in relative.parts[:-1]:
            current = current / part
            if current.is_symlink() or (current.exists() and not current.is_dir()):
                conflicts.append(current.relative_to(destination))
                break
        if target.exists() or target.is_symlink():
            conflicts.append(relative)

    env_local = destination / ".env.local"
    if env_local.exists() or env_local.is_symlink():
        conflicts.append(Path(".env.local"))

    return sorted(set(conflicts))


def copy_template_tree(template_root: Path, destination: Path, app_name: str) -> None:
    for source in template_root.rglob("*"):
        relative = source.relative_to(template_root)
        if source.is_dir():
            continue
        if source.is_symlink():
            raise RuntimeError(f"template contains unsupported symlink: {relative}")

        target = destination / relative
        if target.exists() or target.is_symlink():
            raise RuntimeError(f"Refusing to overwrite existing path: {relative}")
        target.parent.mkdir(parents=True, exist_ok=True)
        content = source.read_bytes()
        if relative in SUBSTITUTION_FILES:
            text = content.decode("utf-8").replace("{{APP_NAME}}", app_name)
            target.write_text(text, encoding="utf-8")
        else:
            target.write_bytes(content)


def resolve_credentials(args: argparse.Namespace) -> tuple[str, str]:
    key_id = args.key_id or os.environ.get("APCA_API_KEY_ID")
    secret = args.secret or os.environ.get("APCA_API_SECRET_KEY")
    if key_id and secret:
        return key_id, secret
    if args.allow_placeholder_credentials:
        return "your_paper_key_id", "your_paper_secret_key"
    raise ValueError(
        "Missing paper trading credentials. Set APCA_API_KEY_ID and "
        "APCA_API_SECRET_KEY, pass --key-id/--secret, or use "
        "--allow-placeholder-credentials."
    )


def write_env_local(
    target: Path,
    *,
    key_id: str,
    secret: str,
    paper: str,
) -> None:
    env_local = target / ".env.local"
    if env_local.exists() or env_local.is_symlink():
        raise RuntimeError("Refusing to overwrite existing path: .env.local")

    env_local.write_text(
        "\n".join(
            [
                "# Alpaca starter dashboard local environment.",
                "# This file is generated locally by the starter-dashboard skill.",
                "# Never commit real credentials.",
                f"APCA_API_KEY_ID={json.dumps(key_id)}",
                f"APCA_API_SECRET_KEY={json.dumps(secret)}",
                f"APCA_PAPER={json.dumps(paper)}",
                "",
            ]
        ),
        encoding="utf-8",
    )


def main() -> int:
    args = parse_args()
    skill_root = Path(__file__).resolve().parents[1]
    template_root = skill_root / "template"

    try:
        if not template_root.is_dir():
            raise RuntimeError(f"Missing template directory: {template_root}")

        target, app_name = resolve_target(
            args.target_directory,
            args.app_name,
            args.create_subdirectory,
        )
        validate_app_name(app_name)
        validate_target_directory(target)
        conflicts = template_conflicts(template_root, target)
        if conflicts:
            rendered = ", ".join(str(path) for path in conflicts)
            raise ValueError(f"target_directory has existing generated paths: {rendered}")
        key_id, secret = resolve_credentials(args)

        target.mkdir(parents=True, exist_ok=True)
        try:
            copy_template_tree(template_root, target, app_name)
            write_env_local(
                target,
                key_id=key_id,
                secret=secret,
                paper=args.paper,
            )
        except Exception:
            if not any(target.iterdir()):
                target.rmdir()
            raise
    except Exception as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1

    print(json.dumps({"target_directory": str(target), "app_name": app_name}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
