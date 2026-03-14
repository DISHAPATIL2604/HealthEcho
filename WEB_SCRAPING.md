# Web Scraping Sources (WHO/NIH)

You can pull reference content directly from WHO/NIH pages into `medical_docs`.

## Run

```powershell
cd d:\HealthEcho\healthecho-backend
.\.venv\Scripts\python .\scripts\scrape_sources.py
.\.venv\Scripts\python .\scripts\ingest.py
```

## Custom URLs

```powershell
.\.venv\Scripts\python .\scripts\scrape_sources.py --url https://www.who.int/health-topics/diabetes --url https://www.nhlbi.nih.gov/health/anemia
.\.venv\Scripts\python .\scripts\ingest.py
```

## Output
- Scraped text: `medical_docs/scraped/text/*.txt`
- Downloaded linked PDFs: `medical_docs/scraped/pdf/*.pdf`

## Notes
- Respect website terms and robots policy.
- Ingestion now indexes `.pdf`, `.txt`, and `.md` files under `medical_docs` (excluding `README.md`).
