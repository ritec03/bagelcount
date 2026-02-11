from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    beancount_file: str = (
        "sample_ledger.beancount"  # Default, can be overridden by env var
    )

    model_config = SettingsConfigDict(
        env_file=".env",
        env_ignore_empty=True,
        extra="ignore",
    )


settings = Settings()
