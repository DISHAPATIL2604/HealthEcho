from __future__ import annotations

import argparse
import re
from pathlib import Path
from urllib.parse import urljoin, urlparse

import requests

USER_AGENT = "HealthEchoBot/1.0 (+local-research)"

DEFAULT_URLS = [
    "https://www.who.int/health-topics/diabetes",
    "https://www.who.int/health-topics/anemia",
    "https://www.nhlbi.nih.gov/health/anemia",
    "https://www.niddk.nih.gov/health-information/diabetes/overview/what-is-diabetes",
]


def safe_filename(name: str) -> str:
    name = re.sub(r"[^a-zA-Z0-9._-]+", "_", name).strip("._")
    return name or "document"


def fetch(url: str) -> str:
    resp = requests.get(url, timeout=30, headers={"User-Agent": USER_AGENT})
    resp.raise_for_status()
    return resp.text


def extract_pdf_links(html: str, base_url: str) -> list[str]:
    hrefs = re.findall(r"href=[\"']([^\"']+)[\"']", html, flags=re.IGNORECASE)
    pdfs: list[str] = []
    for href in hrefs:
        absolute = urljoin(base_url, href)
        if absolute.lower().endswith(".pdf"):
            pdfs.append(absolute)
    return sorted(set(pdfs))


def extract_visible_text(html: str) -> str:
    no_script = re.sub(r"<script[\\s\\S]*?</script>", " ", html, flags=re.IGNORECASE)
    no_style = re.sub(r"<style[\\s\\S]*?</style>", " ", no_script, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", " ", no_style)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def download_file(url: str, out_path: Path) -> bool:
    try:
        with requests.get(url, timeout=45, headers={"User-Agent": USER_AGENT}, stream=True) as resp:
            resp.raise_for_status()
            with out_path.open("wb") as f:
                for chunk in resp.iter_content(chunk_size=8192):
                    if chunk:
                        f.write(chunk)
        return True
    except Exception:
        return False


def scrape_sources(urls: list[str], medical_docs_dir: Path, max_pdfs_per_page: int) -> dict[str, int]:
    text_dir = medical_docs_dir / "scraped" / "text"
    pdf_dir = medical_docs_dir / "scraped" / "pdf"
    text_dir.mkdir(parents=True, exist_ok=True)
    pdf_dir.mkdir(parents=True, exist_ok=True)

    stats = {"pages_saved": 0, "pdfs_downloaded": 0, "pdf_links_found": 0}

    for url in urls:
        try:
            html = fetch(url)
        except Exception:
            continue

        host = urlparse(url).netloc.replace(":", "_")
        stem = safe_filename(urlparse(url).path.replace("/", "_") or "index")
        out_txt = text_dir / f"{host}_{stem}.txt"
        text = extract_visible_text(html)
        if text:
            out_txt.write_text(text, encoding="utf-8")
            stats["pages_saved"] += 1

        pdf_links = extract_pdf_links(html, url)
        stats["pdf_links_found"] += len(pdf_links)

        for pdf_url in pdf_links[:max_pdfs_per_page]:
            parsed = urlparse(pdf_url)
            pdf_name = safe_filename(Path(parsed.path).name or "reference.pdf")
            out_pdf = pdf_dir / pdf_name
            if out_pdf.exists():
                continue
            if download_file(pdf_url, out_pdf):
                stats["pdfs_downloaded"] += 1

    return stats


def main() -> None:
    parser = argparse.ArgumentParser(description="Scrape WHO/NIH medical pages into medical_docs.")
    parser.add_argument("--url", action="append", dest="urls", help="Source URL. Repeatable.")
    parser.add_argument("--max-pdfs-per-page", type=int, default=4)
    parser.add_argument("--docs-dir", default="../medical_docs")
    args = parser.parse_args()

    urls = args.urls or DEFAULT_URLS
    docs_dir = Path(args.docs_dir).resolve()
    docs_dir.mkdir(parents=True, exist_ok=True)

    stats = scrape_sources(urls, docs_dir, max(0, args.max_pdfs_per_page))
    print(stats)


if __name__ == "__main__":
    main()
