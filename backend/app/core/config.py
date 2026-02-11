from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    beancount_file: str = "main.beancount"  # Default, can be overridden by env var
    budget_file: str = "budgets.beancount"  # File for writing new budgets

    model_config = SettingsConfigDict(
        env_file=".env",
        env_ignore_empty=True,
        extra="ignore",
    )

settings = Settings()
