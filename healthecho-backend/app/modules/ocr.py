from io import BytesIO

import pytesseract
from PIL import Image

from app.core.config import settings

if settings.tesseract_cmd:
    pytesseract.pytesseract.tesseract_cmd = settings.tesseract_cmd


def image_bytes_to_text(image_bytes: bytes) -> str:
    image = Image.open(BytesIO(image_bytes)).convert("RGB")
    return pytesseract.image_to_string(image)
