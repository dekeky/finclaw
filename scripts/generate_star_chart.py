#!/usr/bin/env python3
"""Generate a self-contained star history SVG for the README (no external refs)."""

from __future__ import annotations

import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

REPO = os.environ.get("GITHUB_REPOSITORY", "dekeky/finclaw")
README_PATH = os.path.join(os.path.dirname(__file__), "..", "README.md")
OUT_PATH = os.path.join(os.path.dirname(__file__), "..", "assets", "star-history.svg")
CACHE_PATH = os.path.join(os.path.dirname(__file__), "..", "assets", "star-history-data.json")
WIDTH, HEIGHT = 800, 400
COLOR = "#dd4528"
DATA_SOURCE = "live"


def auth_tokens() -> list[str]:
    """Try custom PAT first, then Actions/default GITHUB_TOKEN."""
    seen: set[str] = set()
    tokens: list[str] = []
    for key in ("GH_STAR_HISTORY_TOKEN", "GITHUB_TOKEN", "GITHUB_PAT"):
        value = os.environ.get(key, "").strip()
        if value and value not in seen:
            seen.add(value)
            tokens.append(value)
    return tokens


def api_request(url: str, accept: str, token: str) -> dict | list:
    headers = {"Accept": accept, "User-Agent": "finclaw-star-chart"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.load(resp)


def graphql_request(query: str, variables: dict, token: str) -> dict:
    payload = json.dumps({"query": query, "variables": variables}).encode("utf-8")
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "User-Agent": "finclaw-star-chart",
    }
    req = urllib.request.Request("https://api.github.com/graphql", data=payload, headers=headers)
    with urllib.request.urlopen(req, timeout=30) as resp:
        body = json.load(resp)
    if body.get("errors"):
        raise urllib.error.HTTPError(
            url="https://api.github.com/graphql",
            code=401,
            msg=str(body["errors"]),
            hdrs=None,
            fp=None,
        )
    return body["data"]


def parse_github_datetime(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def fetch_stargazer_dates_rest(token: str) -> list[datetime]:
    dates: list[datetime] = []
    page = 1
    while True:
        url = f"https://api.github.com/repos/{REPO}/stargazers?per_page=100&page={page}"
        try:
            batch = api_request(url, "application/vnd.github.v3.star+json", token)
        except urllib.error.HTTPError as exc:
            if exc.code in (401, 403):
                raise
            if dates:
                print(
                    f"GitHub stargazers API page {page} failed ({exc.code}); using {len(dates)} stars collected.",
                    file=sys.stderr,
                )
                break
            raise

        if not batch:
            break

        for item in batch:
            starred_at = item.get("starred_at")
            if starred_at:
                dates.append(parse_github_datetime(starred_at))

        if len(batch) < 100:
            break
        page += 1
        time.sleep(0.2)

    dates.sort()
    return dates


def fetch_stargazer_dates_graphql(token: str) -> list[datetime]:
    owner, name = REPO.split("/", 1)
    query = """
    query($owner: String!, $name: String!, $after: String) {
      repository(owner: $owner, name: $name) {
        stargazers(first: 100, after: $after, orderBy: {field: STARRED_AT, direction: ASC}) {
          edges { starredAt }
          pageInfo { hasNextPage endCursor }
        }
      }
    }
    """
    dates: list[datetime] = []
    cursor: str | None = None
    while True:
        data = graphql_request(query, {"owner": owner, "name": name, "after": cursor}, token)
        repo = data.get("repository") or {}
        stargazers = repo.get("stargazers") or {}
        edges = stargazers.get("edges") or []
        for edge in edges:
            starred_at = edge.get("starredAt")
            if starred_at:
                dates.append(parse_github_datetime(starred_at))
        page_info = stargazers.get("pageInfo") or {}
        if not page_info.get("hasNextPage"):
            break
        cursor = page_info.get("endCursor")
        if not cursor:
            break
        time.sleep(0.2)

    dates.sort()
    return dates


def fetch_stargazer_dates() -> list[datetime]:
    global DATA_SOURCE
    tokens = auth_tokens()
    if not tokens:
        print(
            "No GitHub token available; stargazers timeline requires authentication. "
            "Set GH_STAR_HISTORY_TOKEN or GITHUB_TOKEN.",
            file=sys.stderr,
        )
        DATA_SOURCE = "cache"
        return []

    last_error: str | None = None
    for token in tokens:
        for fetcher in (fetch_stargazer_dates_rest, fetch_stargazer_dates_graphql):
            try:
                dates = fetcher(token)
                if dates:
                    DATA_SOURCE = "live"
                    return dates
            except urllib.error.HTTPError as exc:
                last_error = f"{fetcher.__name__}: HTTP {exc.code}"
                continue

    print(
        "Unable to fetch per-star timeline with available tokens"
        + (f" ({last_error})" if last_error else "")
        + "; falling back to cached snapshots.",
        file=sys.stderr,
    )
    DATA_SOURCE = "cache"
    return []


def fetch_star_count(token: str = "") -> int:
    tokens = [token] if token else auth_tokens()
    for tok in tokens or [""]:
        try:
            data = api_request(
                f"https://api.github.com/repos/{REPO}",
                "application/vnd.github.v3+json",
                tok,
            )
            return int(data.get("stargazers_count") or 0)
        except (urllib.error.HTTPError, TypeError, ValueError):
            continue
    return 0


def fetch_repo_created(token: str = "") -> datetime:
    tokens = [token] if token else auth_tokens()
    for tok in tokens or [""]:
        try:
            data = api_request(
                f"https://api.github.com/repos/{REPO}",
                "application/vnd.github.v3+json",
                tok,
            )
            created = data.get("created_at")
            if created:
                return parse_github_datetime(created)
        except urllib.error.HTTPError:
            continue
    return datetime(2026, 4, 6, tzinfo=timezone.utc)


def load_cache() -> list[tuple[datetime, int]]:
    path = os.path.normpath(CACHE_PATH)
    if not os.path.exists(path):
        return []
    try:
        with open(path, encoding="utf-8") as f:
            payload = json.load(f)
    except (OSError, json.JSONDecodeError, TypeError, ValueError):
        return []

    if payload.get("repo") != REPO:
        return []

    points: list[tuple[datetime, int]] = []
    for item in payload.get("points") or []:
        if not isinstance(item, list) or len(item) != 2:
            continue
        try:
            points.append((parse_github_datetime(str(item[0])), int(item[1])))
        except (TypeError, ValueError):
            continue
    points.sort(key=lambda pair: pair[0])
    return points


def save_cache(series: list[tuple[datetime, int]], source: str) -> None:
    path = os.path.normpath(CACHE_PATH)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    payload = {
        "repo": REPO,
        "source": source,
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "points": [[dt.isoformat(), count] for dt, count in series],
    }
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)


def append_cache_snapshot(star_count: int, repo_created: datetime) -> list[tuple[datetime, int]]:
    now = datetime.now(timezone.utc)
    series = load_cache()
    if not series:
        series = [(repo_created, 0)]

    last_dt, last_count = series[-1]
    if last_dt.date() == now.date() and last_count == star_count:
        return series

    if last_count == star_count and (now - last_dt).total_seconds() < 3600:
        return series

    series.append((now, star_count))
    series.sort(key=lambda pair: pair[0])
    save_cache(series, "cache")
    return series


def build_series(star_dates: list[datetime], repo_created: datetime) -> list[tuple[datetime, int]]:
    if DATA_SOURCE == "live" and star_dates:
        start = min(repo_created, star_dates[0])
        series: list[tuple[datetime, int]] = [(start, 0)]
        for i, dt in enumerate(star_dates, start=1):
            series.append((dt, i))
        save_cache(series, "live")
        return series

    cached = load_cache()
    if cached:
        return cached

    count = fetch_star_count()
    start = repo_created
    end = datetime.now(timezone.utc)
    if count <= 0:
        series = [(start, 0), (end, 0)]
    else:
        series = [(start, 0), (end, count)]
    return append_cache_snapshot(count, repo_created)


def format_axis_date(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%d")


def generate_svg(series: list[tuple[datetime, int]]) -> str:
    margin_left, margin_right, margin_top, margin_bottom = 70, 30, 50, 60
    plot_w = WIDTH - margin_left - margin_right
    plot_h = HEIGHT - margin_top - margin_bottom

    dates = [p[0] for p in series]
    counts = [p[1] for p in series]
    t_min = min(dates).timestamp()
    t_max = max(dates).timestamp()
    if t_max == t_min:
        t_max += 86400

    y_max = max(counts)
    y_max = max(y_max, 1)

    def x_pos(dt: datetime) -> float:
        ratio = (dt.timestamp() - t_min) / (t_max - t_min)
        return margin_left + ratio * plot_w

    def y_pos(count: int) -> float:
        ratio = count / y_max
        return margin_top + plot_h - ratio * plot_h

    line_points = " ".join(f"{x_pos(dt):.1f},{y_pos(c):.1f}" for dt, c in series)
    area_points = (
        f"{margin_left:.1f},{margin_top + plot_h:.1f} "
        + line_points
        + f" {x_pos(series[-1][0]):.1f},{margin_top + plot_h:.1f}"
    )

    y_ticks = list(range(0, y_max + 1))
    x_tick_dates = [dates[0], dates[-1]]
    if len(dates) > 2:
        mid = dates[len(dates) // 2]
        if mid not in x_tick_dates:
            x_tick_dates.insert(1, mid)
    x_tick_dates = sorted(set(x_tick_dates))

    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{WIDTH}" height="{HEIGHT}" viewBox="0 0 {WIDTH} {HEIGHT}">',
        '<rect width="100%" height="100%" fill="#ffffff"/>',
        f'<text x="{WIDTH/2:.1f}" y="28" text-anchor="middle" font-family="system-ui,sans-serif" font-size="18" font-weight="700" fill="#111">Star History</text>',
        f'<text x="{WIDTH/2:.1f}" y="{HEIGHT - 12}" text-anchor="middle" font-family="system-ui,sans-serif" font-size="13" fill="#444">Date</text>',
        f'<text x="18" y="{HEIGHT/2:.1f}" text-anchor="middle" font-family="system-ui,sans-serif" font-size="13" fill="#444" transform="rotate(-90 18 {HEIGHT/2:.1f})">GitHub Stars</text>',
        f'<line x1="{margin_left}" y1="{margin_top + plot_h}" x2="{margin_left + plot_w}" y2="{margin_top + plot_h}" stroke="#222" stroke-width="1.5"/>',
        f'<line x1="{margin_left}" y1="{margin_top}" x2="{margin_left}" y2="{margin_top + plot_h}" stroke="#222" stroke-width="1.5"/>',
    ]

    for tick in y_ticks:
        y = y_pos(tick)
        parts.append(
            f'<line x1="{margin_left - 4}" y1="{y:.1f}" x2="{margin_left}" y2="{y:.1f}" stroke="#666" stroke-width="1"/>'
        )
        parts.append(
            f'<text x="{margin_left - 8}" y="{y + 4:.1f}" text-anchor="end" font-family="system-ui,sans-serif" font-size="11" fill="#666">{tick}</text>'
        )

    for dt in x_tick_dates:
        x = x_pos(dt)
        parts.append(
            f'<line x1="{x:.1f}" y1="{margin_top + plot_h}" x2="{x:.1f}" y2="{margin_top + plot_h + 4}" stroke="#666" stroke-width="1"/>'
        )
        parts.append(
            f'<text x="{x:.1f}" y="{margin_top + plot_h + 18}" text-anchor="middle" font-family="system-ui,sans-serif" font-size="11" fill="#666">{format_axis_date(dt)}</text>'
        )

    parts.append(f'<polygon points="{area_points}" fill="{COLOR}" fill-opacity="0.12"/>')
    parts.append(
        f'<polyline points="{line_points}" fill="none" stroke="{COLOR}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>'
    )

    show_markers = len(series) <= 80
    if show_markers:
        for dt, c in series[1:]:
            x, y = x_pos(dt), y_pos(c)
            parts.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="4" fill="{COLOR}"/>')

    parts.append(
        f'<rect x="{margin_left + 12}" y="{margin_top + 8}" width="150" height="28" rx="4" fill="#fff" stroke="#ccc"/>'
    )
    parts.append(f'<rect x="{margin_left + 20}" y="{margin_top + 18}" width="10" height="10" rx="2" fill="{COLOR}"/>')
    parts.append(
        f'<text x="{margin_left + 36}" y="{margin_top + 27}" font-family="system-ui,sans-serif" font-size="13" fill="#111">{REPO}</text>'
    )
    footer_note = {
        "live": "live stargazers data",
        "cache": "cached snapshots · configure GH_STAR_HISTORY_TOKEN for full timeline",
    }.get(DATA_SOURCE, "cached snapshots")
    parts.append(
        f'<text x="{WIDTH - margin_right}" y="{HEIGHT - 12}" text-anchor="end" font-family="system-ui,sans-serif" font-size="11" fill="#888">{footer_note} · updated {datetime.now(timezone.utc).strftime("%Y-%m-%d")}</text>'
    )
    parts.append("</svg>")
    return "\n".join(parts)


def update_readme() -> None:
    start = "<!-- star-history:start -->"
    end = "<!-- star-history:end -->"
    readme = os.path.normpath(README_PATH)
    if not os.path.exists(readme):
        print(f"{readme} not found; skipping README update", file=sys.stderr)
        return

    text = open(readme, encoding="utf-8").read()
    if start not in text or end not in text:
        print("star-history markers not found in README; skipping update", file=sys.stderr)
        return

    repo_q = REPO.replace("/", "%2F")
    body = (
        f'[![Star 趋势](assets/star-history.svg)]'
        f'(https://www.star-history.com/?type=date&repos={repo_q})'
    )
    block = f"{start}\n{body}\n{end}"
    new_text = re.sub(
        re.escape(start) + r".*?" + re.escape(end),
        lambda _: block,
        text,
        count=1,
        flags=re.S,
    )
    with open(readme, "w", encoding="utf-8") as f:
        f.write(new_text)
    print(f"Updated {readme}")


def main() -> None:
    global DATA_SOURCE
    repo_created = fetch_repo_created()
    star_dates = fetch_stargazer_dates()
    if DATA_SOURCE == "cache":
        count = fetch_star_count()
        append_cache_snapshot(count, repo_created)
    series = build_series(star_dates, repo_created)
    svg = generate_svg(series)

    out = os.path.normpath(OUT_PATH)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w", encoding="utf-8") as f:
        f.write(svg)
    star_total = series[-1][1] if series else fetch_star_count()
    print(f"Wrote {out} ({star_total} stars, {len(series)} points, source={DATA_SOURCE})")
    update_readme()


if __name__ == "__main__":
    main()
