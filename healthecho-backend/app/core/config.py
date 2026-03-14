from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "HealthEcho API"
    app_env: str = "development"
    cors_origins: str = "http://localhost:5173,http://localhost:3000"

    medical_docs_dir: str = "../medical_docs"
    vectorstore_dir: str = "../vectorstore"
    embeddings_model: str = "sentence-transformers/all-MiniLM-L6-v2"
    rag_top_k: int = 3

    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "mistral"
    ollama_timeout_seconds: int = 90
    llm_provider: str = "ollama"  # ollama | gemini
    gemini_api_key: str | None = None
    gemini_model: str = "gemini-1.5-flash"
    llm_enhancement_enabled: bool = False
    llm_fast_timeout_seconds: int = 12

    tesseract_cmd: str | None = None

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


settings = Settings()
