import re

LAB_PATTERNS: dict[str, list[str]] = {
    "Hemoglobin": [r"hemoglobin", r"haemoglobin", r"\bhb\b"],
    "WBC": [r"\bwbc\b", r"white\s+blood\s+cells?", r"total\s+leucocyte\s+count", r"\btlc\b"],
    "RBC": [r"\brbc\b", r"red\s+blood\s+cells?", r"\btrbc\b"],
    "Platelets": [r"platelets?", r"\bplt\b", r"platelet\s+count"],
    "Glucose": [r"glucose", r"fasting\s+blood\s+sugar", r"\bfbs\b", r"blood\s+sugar"],
    "Cholesterol": [r"cholesterol", r"total\s+cholesterol"],
    "TSH": [r"\btsh\b", r"thyroid\s+stimulating\s+hormone"],
    "Creatinine": [r"creatinine"],
    "Vitamin D": [r"vitamin\s*d", r"25\(oh\)d"],
    "Iron": [r"iron", r"serum\s+iron"],
}

VALUE_CAPTURE = r"([0-9]+(?:\.[0-9]+)?)"
NUMBER_RE = re.compile(r"\b[0-9]+(?:\.[0-9]+)?\b")
RANGE_RE = re.compile(r"\b[0-9]+(?:\.[0-9]+)?\s*[-–]\s*[0-9]+(?:\.[0-9]+)?\b")


def _extract_with_alias(text: str, alias: str) -> float | None:
    # Standard key-value formats: "Hemoglobin: 10.8", "Hb = 11.2", "WBC 7.2"
    pattern = rf"{alias}\s*(?:[:=\-]|\bis\b)?\s*{VALUE_CAPTURE}\b"
    match = re.search(pattern, text, flags=re.IGNORECASE)
    if match:
        try:
            return float(match.group(1))
        except ValueError:
            return None
    return None


def _value_from_line(line: str, alias: str) -> float | None:
    match = re.search(alias, line, flags=re.IGNORECASE)
    if not match:
        return None

    alias_end = match.end()
    ranges = [(m.start(), m.end()) for m in RANGE_RE.finditer(line)]
    candidates: list[tuple[int, float]] = []
    for m in NUMBER_RE.finditer(line):
        start = m.start()
        if any(rs <= start < re_ for rs, re_ in ranges):
            continue
        try:
            candidates.append((start, float(m.group(0))))
        except ValueError:
            continue

    if not candidates:
        return None

    # Prefer the nearest numeric token after alias; otherwise nearest before alias.
    after = [(abs(pos - alias_end), val) for pos, val in candidates if pos >= alias_end]
    if after:
        return sorted(after, key=lambda x: x[0])[0][1]

    before = [(abs(pos - alias_end), val) for pos, val in candidates]
    return sorted(before, key=lambda x: x[0])[0][1]


def extract_lab_values(raw_text: str) -> dict[str, float | None]:
    raw = raw_text or ""
    normalized = raw.replace(",", ".")
    cleaned = re.sub(r"\s+", " ", normalized)
    lines = [ln.strip() for ln in re.split(r"[\r\n]+", normalized) if ln.strip()]
    extracted: dict[str, float | None] = {}

    for lab, aliases in LAB_PATTERNS.items():
        value = None

        # 1) Try global key-value style extraction.
        for alias in aliases:
            value = _extract_with_alias(cleaned, alias)
            if value is not None:
                break

        # 2) Try line-by-line extraction for table/OCR text.
        if value is None:
            for line in lines:
                for alias in aliases:
                    value = _value_from_line(line, alias)
                    if value is not None:
                        break
                if value is not None:
                    break

        extracted[lab] = value

    return extracted
