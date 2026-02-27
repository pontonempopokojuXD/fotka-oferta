from __future__ import annotations

import mimetypes
import re
import shutil
import sys
from collections import deque
from pathlib import Path
from urllib.parse import urljoin, urlparse, urlunparse
from urllib.request import Request, urlopen


BASE_URL = "https://fotofotka.pl/"
OUT_DIR = Path("site-mirror")
MAX_PAGES = 350
TIMEOUT = 20

ASSET_EXTENSIONS = {
    ".jpg",
    ".jpeg",
    ".png",
    ".gif",
    ".webp",
    ".svg",
    ".css",
    ".js",
    ".woff",
    ".woff2",
    ".ttf",
    ".eot",
    ".ico",
    ".mp4",
    ".webm",
}

URL_ATTR_PATTERN = re.compile(
    r'(?P<attr>href|src|action|data-href|poster)=["\'](?P<url>[^"\']+)["\']',
    re.IGNORECASE,
)
SRCSET_BLOCK_PATTERN = re.compile(r'srcset=["\'](?P<value>[^"\']+)["\']', re.IGNORECASE)


def normalize_url(raw_url: str) -> str:
    parsed = urlparse(raw_url)
    scheme = parsed.scheme or "https"
    netloc = parsed.netloc.lower()
    if netloc.startswith("www."):
        netloc = netloc[4:]
    path = re.sub(r"/{2,}", "/", parsed.path or "/")
    if not path.startswith("/"):
        path = "/" + path
    return urlunparse((scheme, netloc, path, "", parsed.query, ""))


def is_valid_candidate_url(raw_url: str) -> bool:
    bad_chars = ('"', "'", "<", ">", "{", "}", "[", "]")
    if any(ch in raw_url for ch in bad_chars):
        return False
    if any(ch.isspace() for ch in raw_url):
        return False
    return True


def is_same_domain(url: str) -> bool:
    parsed = urlparse(url)
    netloc = parsed.netloc.lower()
    if netloc.startswith("www."):
        netloc = netloc[4:]
    return netloc == "fotofotka.pl"


def extension_for_url(url: str) -> str:
    path = urlparse(url).path
    return Path(path).suffix.lower()


def looks_like_asset(url: str, content_type: str | None = None) -> bool:
    ext = extension_for_url(url)
    if ext in ASSET_EXTENSIONS:
        return True
    if content_type:
        return not content_type.startswith("text/html")
    return False


def safe_name(text: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]+", "-", text).strip("-") or "index"


def safe_segment(text: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]+", "-", text).strip("-") or "seg"


def local_path_for_asset(url: str) -> Path:
    parsed = urlparse(url)
    path = parsed.path or "/asset"
    parts = [safe_segment(part) for part in path.lstrip("/").split("/") if part]
    rel = Path(*parts) if parts else Path("asset")
    if rel.name == "":
        rel = rel / "index.bin"
    if parsed.query:
        rel = rel.with_name(f"{rel.stem}-{safe_name(parsed.query)}{rel.suffix}")
    return OUT_DIR / "assets" / rel


def local_path_for_html(url: str) -> Path:
    parsed = urlparse(url)
    path = parsed.path or "/"
    parts = [safe_segment(part) for part in path.lstrip("/").split("/") if part]
    rel = Path(*parts) if parts else Path()
    if str(rel) in ("", "."):
        rel = Path("index")
    if path.endswith("/"):
        rel = rel / "index"
    if parsed.query:
        rel = rel / safe_name(parsed.query)
    return OUT_DIR / "pages" / rel.with_suffix(".html")


def to_relative(from_file: Path, to_file: Path) -> str:
    rel = Path("..") / Path(to_file).relative_to(from_file.parent)
    return rel.as_posix().replace("//", "/")


def fetch_bytes(url: str) -> tuple[bytes, str]:
    req = Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (compatible; MirrorBot/1.0)",
            "Accept": "*/*",
        },
    )
    with urlopen(req, timeout=TIMEOUT) as response:
        data = response.read()
        content_type = (response.headers.get("Content-Type") or "").split(";")[0].strip().lower()
    return data, content_type


def extract_links(html: str, base_url: str) -> tuple[set[str], set[str]]:
    page_links: set[str] = set()
    asset_links: set[str] = set()

    for match in URL_ATTR_PATTERN.finditer(html):
        raw = match.group("url").strip()
        if raw.startswith(("#", "mailto:", "tel:", "javascript:")) or not is_valid_candidate_url(raw):
            continue
        absolute = normalize_url(urljoin(base_url, raw))
        if not is_same_domain(absolute):
            continue
        if extension_for_url(absolute) in ASSET_EXTENSIONS:
            asset_links.add(absolute)
        else:
            page_links.add(absolute)

    for block in SRCSET_BLOCK_PATTERN.finditer(html):
        value = block.group("value")
        for item in value.split(","):
            raw = item.strip().split(" ")[0].strip()
            if not raw or raw.startswith(("data:", "mailto:", "tel:", "javascript:")):
                continue
            if not is_valid_candidate_url(raw):
                continue
            absolute = normalize_url(urljoin(base_url, raw))
            if is_same_domain(absolute):
                asset_links.add(absolute)

    return page_links, asset_links


def rewrite_html(html: str, current_url: str, known_pages: dict[str, Path], known_assets: dict[str, Path]) -> str:
    current_local = local_path_for_html(current_url)

    def relative_link(target: Path) -> str:
        return Path(
            __import__("os").path.relpath(str(target), start=str(current_local.parent))
        ).as_posix()

    def replace_attr(match: re.Match[str]) -> str:
        attr = match.group("attr")
        raw = match.group("url")
        if raw.startswith(("#", "mailto:", "tel:", "javascript:")):
            return match.group(0)

        absolute = normalize_url(urljoin(current_url, raw))
        if not is_same_domain(absolute):
            return match.group(0)

        if absolute in known_pages:
            target = known_pages[absolute]
            rel = relative_link(target)
            return f'{attr}="{rel}"'

        if absolute in known_assets:
            target = known_assets[absolute]
            rel = relative_link(target)
            return f'{attr}="{rel}"'

        return match.group(0)

    updated = URL_ATTR_PATTERN.sub(replace_attr, html)

    def replace_srcset_url(match: re.Match[str]) -> str:
        raw = match.group("url")
        absolute = normalize_url(urljoin(current_url, raw))
        if absolute in known_assets:
            target = known_assets[absolute]
            return Path(target).relative_to(current_local.parent).as_posix()
        return raw

    updated = re.sub(r'(?P<full>srcset=["\'](?P<value>[^"\']+)["\'])', lambda m: m.group("full"), updated)
    return updated


def main() -> int:
    if OUT_DIR.exists():
        shutil.rmtree(OUT_DIR)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "pages").mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "assets").mkdir(parents=True, exist_ok=True)

    start = normalize_url(BASE_URL)
    queue = deque([start])
    seen_pages: set[str] = set()
    html_content_by_url: dict[str, str] = {}
    page_links_by_url: dict[str, set[str]] = {}
    asset_links_all: set[str] = set()

    while queue and len(seen_pages) < MAX_PAGES:
        url = queue.popleft()
        if not is_valid_candidate_url(url):
            continue
        if url in seen_pages:
            continue
        seen_pages.add(url)
        try:
            data, content_type = fetch_bytes(url)
        except Exception as exc:
            print(f"[skip] page fetch failed: {url} ({exc})")
            continue

        if looks_like_asset(url, content_type):
            asset_links_all.add(url)
            continue

        html = data.decode("utf-8", errors="ignore")
        html_content_by_url[url] = html
        pages, assets = extract_links(html, url)
        page_links_by_url[url] = pages
        asset_links_all.update(assets)
        for next_url in pages:
            if next_url not in seen_pages and len(seen_pages) + len(queue) < MAX_PAGES:
                queue.append(next_url)
        print(f"[page] {url}")

    known_pages: dict[str, Path] = {}
    for url in html_content_by_url:
        local = local_path_for_html(url)
        known_pages[url] = local
        local.parent.mkdir(parents=True, exist_ok=True)

    known_assets: dict[str, Path] = {}
    for asset_url in sorted(asset_links_all):
        if not is_valid_candidate_url(asset_url):
            continue
        local_asset = local_path_for_asset(asset_url)
        local_asset.parent.mkdir(parents=True, exist_ok=True)
        try:
            data, content_type = fetch_bytes(asset_url)
            if local_asset.suffix == "":
                guessed = mimetypes.guess_extension(content_type or "") or ".bin"
                local_asset = local_asset.with_suffix(guessed)
            local_asset.write_bytes(data)
            known_assets[asset_url] = local_asset
            print(f"[asset] {asset_url}")
        except Exception as exc:
            print(f"[skip] asset fetch failed: {asset_url} ({exc})")

    for url, html in html_content_by_url.items():
        local = known_pages[url]
        rewritten = rewrite_html(html, url, known_pages, known_assets)
        local.write_text(rewritten, encoding="utf-8")

    index = OUT_DIR / "index.html"
    index.write_text(
        (
            "<!doctype html><html><head><meta charset='utf-8'>"
            "<meta name='viewport' content='width=device-width,initial-scale=1'>"
            "<title>fotofotka.pl mirror</title></head><body>"
            "<h1>Lokalny mirror fotofotka.pl</h1>"
            "<p>Start: <a href='pages/index.html'>pages/index.html</a></p>"
            f"<p>Pobrane strony: {len(known_pages)}, zasoby: {len(known_assets)}</p>"
            "</body></html>"
        ),
        encoding="utf-8",
    )

    print(f"Done. Pages: {len(known_pages)} Assets: {len(known_assets)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
