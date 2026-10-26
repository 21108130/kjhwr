
from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):

    ELEXON_BASE_URL: str = "https://data.elexon.co.uk/bmrs/api/v1"
    HTTP_TIMEOUT: int = 60
    HTTP_MAX_RETRIES: int = 3
    HTTP_RETRY_DELAY: float = 2.0


    DECISION_CUTOFF_HOUR_UTC: int = 10
    DECISION_CUTOFF_MINUTE_UTC: int = 0


    DEFAULT_DATE_FROM: str = "2026-01-01"
    DEFAULT_DATE_TO: str = "2026-01-31"


    CACHE_TTL_SECONDS: int = 300

  
    APP_TITLE: str = "WindIQ – Wind Forecast Accuracy Analytics"
    APP_VERSION: str = "1.0.0"
    CORS_ORIGINS: list[str] = ["http://localhost:3000", "http://localhost:5173", "*"]

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()

