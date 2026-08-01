"""
Generate i2v idle/walk videos for job and named special-resident characters via the xAI Video API,
then ingest into generate_i2v_jobs_locomotion_v1 (frames / GIF / QA).

Uses ~/.grok/auth.json OIDC token (or XAI_API_KEY). This bypasses the Grok Build
image_to_video tool when that tool incorrectly reports ZDR / missing upload_url.

Pipeline (correct order):
  source PNG → POST /v1/videos/generations (image-to-video)
  → download mp4 → extract 8 frames → GIF → auto QA (max 3 attempts)
"""

from __future__ import annotations

import argparse
import base64
import json
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

# Local pipeline helpers
sys.path.insert(0, str(Path(__file__).resolve().parent))
from generate_i2v_jobs_locomotion_v1 import (  # noqa: E402
    ACTIONS,
    JOBS_DIR,
    MAX_ATTEMPTS,
    OUTPUT_ROOT,
    PILOT_CHARACTERS,
    build_prompt,
    cmd_ingest,
    cmd_init,
    cmd_report,
    out_dir,
    save_prompts,
    source_png_for_character,
)

API_BASE = "https://api.x.ai/v1"
DEFAULT_MODEL = "grok-imagine-video"
DEFAULT_DURATION = 6
DEFAULT_RESOLUTION = "480p"


def load_token() -> tuple[str, dict]:
    import os

    env = os.environ.get("XAI_API_KEY") or os.environ.get("GROK_API_KEY")
    if env:
        return env, {"source": "env"}

    auth_path = Path.home() / ".grok" / "auth.json"
    if not auth_path.exists():
        raise SystemExit("No XAI_API_KEY and no ~/.grok/auth.json")
    data = json.loads(auth_path.read_text(encoding="utf-8"))
    entry = next(iter(data.values()))
    token = entry.get("key")
    if not token:
        raise SystemExit("auth.json has no key")
    meta = {
        "source": "auth.json",
        "team_id": entry.get("team_id"),
        "email": entry.get("email"),
    }
    return token, meta


def image_to_data_uri(path: Path) -> str:
    raw = path.read_bytes()
    b64 = base64.b64encode(raw).decode("ascii")
    suffix = path.suffix.lower()
    mime = "image/png" if suffix == ".png" else "image/jpeg"
    return f"data:{mime};base64,{b64}"


def api_request(
    method: str,
    url: str,
    token: str,
    payload: dict | None = None,
    timeout: int = 120,
) -> tuple[dict, dict]:
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            hdrs = {k.lower(): v for k, v in resp.headers.items()}
            body = resp.read().decode("utf-8")
            return (json.loads(body) if body else {}), hdrs
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8", errors="replace")
        hdrs = {k.lower(): v for k, v in (e.headers.items() if e.headers else [])}
        raise RuntimeError(
            f"HTTP {e.code}: {err_body} | zdr={hdrs.get('x-zero-data-retention')}"
        ) from e


def start_i2v(
    token: str,
    image_path: Path,
    prompt: str,
    *,
    model: str = DEFAULT_MODEL,
    duration: int = DEFAULT_DURATION,
    resolution: str = DEFAULT_RESOLUTION,
) -> tuple[str, dict]:
    payload = {
        "model": model,
        "prompt": prompt,
        "duration": duration,
        "resolution": resolution,
        "image": {"url": image_to_data_uri(image_path)},
    }
    data, hdrs = api_request("POST", f"{API_BASE}/videos/generations", token, payload)
    rid = data.get("request_id")
    if not rid:
        raise RuntimeError(f"no request_id in response: {data}")
    return rid, {
        "zdr": hdrs.get("x-zero-data-retention"),
        "data_retention": hdrs.get("x-data-retention"),
        "request_id": rid,
    }


def poll_video(
    token: str,
    request_id: str,
    *,
    interval_s: float = 5.0,
    timeout_s: float = 600.0,
) -> dict:
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        data, hdrs = api_request("GET", f"{API_BASE}/videos/{request_id}", token)
        status = data.get("status")
        if status == "done":
            data["_headers"] = {
                "x-zero-data-retention": hdrs.get("x-zero-data-retention")
            }
            return data
        if status in ("failed", "expired"):
            raise RuntimeError(f"video {request_id} {status}: {data}")
        time.sleep(interval_s)
    raise TimeoutError(f"video {request_id} timed out after {timeout_s}s")


def download(url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(url, method="GET")
    with urllib.request.urlopen(req, timeout=180) as resp:
        dest.write_bytes(resp.read())


def generate_one(
    token: str,
    character: str,
    action: str,
    attempt: int,
    *,
    duration: int,
    resolution: str,
    model: str,
) -> Path:
    source = source_png_for_character(character, action)
    prompt = build_prompt(character, action)
    action_dir = out_dir(character, action)
    action_dir.mkdir(parents=True, exist_ok=True)
    (action_dir / "prompt.txt").write_text(prompt + "\n", encoding="utf-8")

    print(f"[start] {character}/{action} attempt={attempt}", flush=True)
    rid, meta = start_i2v(
        token,
        source,
        prompt,
        model=model,
        duration=duration,
        resolution=resolution,
    )
    print(f"  request_id={rid} zdr={meta.get('zdr')}", flush=True)
    result = poll_video(token, rid)
    video = result.get("video") or {}
    url = video.get("url")
    if not url:
        raise RuntimeError(f"done but no url: {result}")

    raw_dir = action_dir / "attempts" / f"attempt-{attempt}" / "raw"
    raw_dir.mkdir(parents=True, exist_ok=True)
    mp4 = raw_dir / f"{character}__{action}.mp4"
    download(url, mp4)
    (raw_dir / "api_result.json").write_text(
        json.dumps(
            {
                "request_id": rid,
                "start_meta": meta,
                "result": {
                    k: v
                    for k, v in result.items()
                    if k != "video" or isinstance(v, dict)
                },
                "video_url": url,
                "local_mp4": str(mp4),
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    print(f"  downloaded {mp4}", flush=True)
    return mp4


def ingest(
    character: str,
    action: str,
    video: Path,
    attempt: int,
    *,
    max_attempts: int = MAX_ATTEMPTS,
) -> None:
    # Reuse CLI ingest via Namespace-like object
    ns = argparse.Namespace(
        character=character,
        action=action,
        video=str(video),
        attempt=attempt,
        max_attempts=max_attempts,
    )
    cmd_ingest(ns)


def should_retry_after_ingest(status: str, attempt: int, max_attempts: int) -> bool:
    return status == "retry" and attempt < max_attempts


def has_complete_output(character: str, action: str) -> bool:
    """True if final mp4 + 8 rekeyed frames already exist (user will curate later)."""
    d = out_dir(character, action)
    mp4 = d / f"{character}__{action}.mp4"
    frames = d / "frames"
    if not mp4.exists() or not frames.is_dir():
        return False
    frame_files = [p for p in frames.glob("frame_*.png") if p.parent == frames]
    if len(frame_files) < 8:
        return False
    # Prefer outputs from the rekey pipeline (raw_extract present on latest attempt)
    if (frames / "raw_extract").is_dir():
        return True
    attempts = d / "attempts"
    if attempts.is_dir():
        for att in sorted(attempts.glob("attempt-*"), reverse=True):
            if (att / "frames" / "raw_extract").is_dir() and (
                att / "raw" / f"{character}__{action}.mp4"
            ).exists():
                return True
    # No rekey marker → treat as incomplete so bulk pass can refresh
    return False


def run_batch(
    characters: list[str],
    *,
    actions: tuple[str, ...] = ACTIONS,
    start_attempt: int = 1,
    max_attempts: int = MAX_ATTEMPTS,
    duration: int = DEFAULT_DURATION,
    resolution: str = DEFAULT_RESOLUTION,
    model: str = DEFAULT_MODEL,
    stop_on_fail: bool = False,
    skip_existing: bool = False,
    progress_path: Path | None = None,
    workers: int = 1,
) -> dict:
    token, auth_meta = load_token()
    print(f"auth={auth_meta}", flush=True)
    save_prompts(characters, OUTPUT_ROOT)

    summary: dict = {
        "auth": auth_meta,
        "characters": {},
        "passed": 0,
        "failed": 0,
        "skipped": 0,
        "completed": 0,
        "total": 0,
        "errors": [],
    }

    for character in characters:
        summary["characters"][character] = {}

    def run_unit(character: str, action: str) -> tuple[str, list[str]]:
        errors: list[str] = []
        if skip_existing and has_complete_output(character, action):
            print(f"[skip] {character}/{action} already has mp4+8 frames", flush=True)
            return "skipped", errors

        last_status = "failed"
        for attempt in range(start_attempt, max_attempts + 1):
            try:
                mp4 = generate_one(
                    token,
                    character,
                    action,
                    attempt,
                    duration=duration,
                    resolution=resolution,
                    model=model,
                )
                ingest(
                    character,
                    action,
                    mp4,
                    attempt,
                    max_attempts=max_attempts,
                )
                run_path = out_dir(character, action) / "run.json"
                run = json.loads(run_path.read_text(encoding="utf-8"))
                last_status = run.get("status", "unknown")
                print(f"  ingest status={last_status}", flush=True)
                if last_status == "passed":
                    break
                if should_retry_after_ingest(last_status, attempt, max_attempts):
                    print(f"  QA failed → retry {attempt + 1}", flush=True)
                    continue
                if has_complete_output(character, action):
                    break
            except Exception as exc:
                message = f"{character}/{action} attempt {attempt}: {exc}"
                print(f"  ERROR {message}", flush=True)
                errors.append(message)
                last_status = "error"
                if attempt >= max_attempts:
                    break
                time.sleep(2)
        return last_status, errors

    units = [(character, action) for character in characters for action in actions]
    if workers <= 0 or workers > 4:
        raise ValueError("workers must be between 1 and 4")
    with ThreadPoolExecutor(max_workers=workers) as executor:
        futures = {
            executor.submit(run_unit, character, action): (character, action)
            for character, action in units
        }
        for future in as_completed(futures):
            character, action = futures[future]
            summary["total"] += 1
            last_status, errors = future.result()
            summary["errors"].extend(errors)
            summary["characters"][character][action] = last_status
            if last_status == "skipped":
                summary["skipped"] += 1
                continue
            if last_status in ("passed", "done", "best_effort", "retry", "failed"):
                # failed QA still counts as completed asset if frames exist
                if has_complete_output(character, action):
                    summary["completed"] += 1
                    if last_status == "passed":
                        summary["passed"] += 1
                else:
                    summary["failed"] += 1
            else:
                summary["failed"] += 1
                if stop_on_fail:
                    return summary
            if progress_path:
                progress_path.write_text(
                    json.dumps(summary, ensure_ascii=False, indent=2) + "\n",
                    encoding="utf-8",
                )

    return summary


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    p = argparse.ArgumentParser(description="i2v jobs via xAI Video API")
    p.add_argument(
        "--characters",
        nargs="*",
        default=list(PILOT_CHARACTERS),
        help="character stems (default: pilot four)",
    )
    p.add_argument("--all-jobs", action="store_true")
    p.add_argument("--actions", nargs="*", default=list(ACTIONS), choices=list(ACTIONS))
    p.add_argument("--duration", type=int, default=DEFAULT_DURATION)
    p.add_argument("--resolution", default=DEFAULT_RESOLUTION, choices=["480p", "720p", "1080p"])
    p.add_argument("--model", default=DEFAULT_MODEL)
    p.add_argument("--workers", type=int, default=4, choices=[1, 2, 3, 4])
    p.add_argument(
        "--start-attempt",
        type=int,
        default=1,
        help="First attempt number to generate (use 2 to append a targeted second take).",
    )
    p.add_argument("--max-attempts", type=int, default=MAX_ATTEMPTS)
    p.add_argument(
        "--skip-existing",
        action="store_true",
        help="Skip character/action that already has final mp4 + 8 frames",
    )
    p.add_argument("--init-only", action="store_true")
    p.add_argument("--report-only", action="store_true")
    args = p.parse_args()

    characters = (
        sorted(p.stem for p in JOBS_DIR.glob("*.png"))
        if args.all_jobs
        else list(args.characters)
    )

    if args.init_only:
        ns = argparse.Namespace(characters=characters, all_jobs=False)
        cmd_init(ns)
        return

    if args.report_only:
        ns = argparse.Namespace(
            characters=characters, all_jobs=False, out="pilot_qa_report.json"
        )
        cmd_report(ns)
        return

    # init dirs + prompts
    ns = argparse.Namespace(characters=characters, all_jobs=False)
    cmd_init(ns)

    progress_path = OUTPUT_ROOT / "api_run_progress.json"
    summary = run_batch(
        characters,
        actions=tuple(args.actions),
        start_attempt=args.start_attempt,
        max_attempts=args.max_attempts,
        duration=args.duration,
        resolution=args.resolution,
        model=args.model,
        skip_existing=args.skip_existing,
        progress_path=progress_path,
        workers=args.workers,
    )
    report_path = OUTPUT_ROOT / "api_run_summary.json"
    report_path.write_text(
        json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    ns = argparse.Namespace(
        characters=characters, all_jobs=False, out="batch_qa_report.json"
    )
    cmd_report(ns)
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    print(f"summary={report_path}")
    print(f"progress={progress_path}")


if __name__ == "__main__":
    main()
