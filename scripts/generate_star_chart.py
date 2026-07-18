#!/usr/bin/env python3
"""Generate a self-contained star history SVG for the README (no external refs)."""

from __future__ import annotations

import json
import os
import re
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone

REPO = os.environ.get("GITHUB_REPOSITORY", "dekeky/finclaw")
README_PATH = os.path.join(os.path.dirname(__file__), "..", "README.md")
OUT_PATH = os.path.join(os.path.dirname(__file__), "..", "assets", "star-history.svg")
WIDTH, HEIGHT = 800, 400
COLOR = "#dd4528"


def fetch_stargazer_dates() -> list[datetime]:
    token = os.environ.get("GITHUB_TOKEN", "")
    headers = {"Accept": "application/vnd.github.v3.star+json", "User-Agent": "finclaw-star-chart"}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    dates: list[datetime] = []
    page = 1
    while True:
        url = f"https://api.github.com/repos/{REPO}/stargazers?per_page=100&page={page}"
        req = urllib.request.Request(url, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                batch = json.load(resp)
        except urllib.error.HTTPError as exc:
            if exc.code in (403, 401):
                print(
                    f"GitHub API {exc.code} for stargazers; using fallback star dates. "
                    "Add GH_STAR_HISTORY_TOKEN (Metadata Read-only) if this persists.",
                    file=sys.stderr,
                )
                return fallback_dates()
            raise

        if not batch:
            break
        for item in batch:
            starred_at = item.get("starred_at")
            if starred_at:
                dates.append(datetime.fromisoformat(starred_at.replace("Z", "+00:00")))
        if len(batch) < 100:
            break
        page += 1

    dates.sort()
    return dates or fallback_dates()


def fallback_dates() -> list[datetime]:
    """Known dates when the public API is unavailable."""
    return [
        datetime(2026, 5, 13, tzinfo=timezone.utc),
        datetime(2026, 6, 27, tzinfo=timezone.utc),
    ]


def fetch_repo_created() -> datetime:
    token = os.environ.get("GITHUB_TOKEN", "")
    headers = {"Accept": "application/vnd.github.v3+json", "User-Agent": "finclaw-star-chart"}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    url = f"https://api.github.com/repos/{REPO}"
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.load(resp)
        created = data.get("created_at")
        if created:
            return datetime.fromisoformat(created.replace("Z", "+00:00"))
    except urllib.error.HTTPError:
        pass
    return datetime(2026, 4, 6, tzinfo=timezone.utc)


def build_series(star_dates: list[datetime], repo_created: datetime) -> list[tuple[datetime, int]]:
    start = min(repo_created, star_dates[0]) if star_dates else repo_created
    series: list[tuple[datetime, int]] = [(start, 0)]
    for i, dt in enumerate(star_dates, start=1):
        series.append((dt, i))
    return series


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
    parts.append(
        f'<text x="{WIDTH - margin_right}" y="{HEIGHT - 12}" text-anchor="end" font-family="system-ui,sans-serif" font-size="11" fill="#888">star-history.com style · updated {datetime.now(timezone.utc).strftime("%Y-%m-%d")}</text>'
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
    star_dates = fetch_stargazer_dates()
    repo_created = fetch_repo_created()
    series = build_series(star_dates, repo_created)
    svg = generate_svg(series)

    out = os.path.normpath(OUT_PATH)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w", encoding="utf-8") as f:
        f.write(svg)
    print(f"Wrote {out} ({len(star_dates)} stars)")
    update_readme()


if __name__ == "__main__":
    main()
