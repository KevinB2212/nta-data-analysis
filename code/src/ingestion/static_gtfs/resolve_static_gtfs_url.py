from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Optional
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup


@dataclass(frozen=True)
class GtfsStaticSource:
    landing_page_url: str
    zip_url: str


ZIP_HREF_RE = re.compile(r"\.zip(\?|#|$)", re.IGNORECASE)


def _is_http_url(url: str) -> bool:
    try:
        return urlparse(url).scheme in {"http", "https"}
    except Exception:
        return False


def extract_gtfs_zip_url_from_html(
    html: str,
    base_url: str,
    *,
    prefer_all_zip: bool = True,
) -> str:
    soup = BeautifulSoup(html, "html.parser")

    zip_links: list[str] = []
    for a in soup.find_all("a", href=True):
        href = a["href"].strip()
        if not href:
            continue
        if ZIP_HREF_RE.search(href):
            zip_links.append(urljoin(base_url, href))

    if not zip_links:
        raise ValueError("No .zip links found in provided HTML.")

    if prefer_all_zip:
        for u in zip_links:
            if "gtfs_all" in u.lower():
                return u

    return zip_links[0]


def resolve_tfi_static_gtfs_zip_url(
    landing_page_url: str,
    *,
    timeout_seconds: int = 20,
    prefer_all_zip: bool = True,
    user_agent: str = "nta-data-analysis/1.0 (+academic project)",
) -> GtfsStaticSource:
    if not _is_http_url(landing_page_url):
        raise ValueError(f"landing_page_url must be http(s): {landing_page_url}")

    headers = {"User-Agent": user_agent}
    resp = requests.get(landing_page_url, headers=headers, timeout=timeout_seconds)
    resp.raise_for_status()

    zip_url = extract_gtfs_zip_url_from_html(
        resp.text,
        base_url=landing_page_url,
        prefer_all_zip=prefer_all_zip,
    )
    return GtfsStaticSource(landing_page_url=landing_page_url, zip_url=zip_url)
