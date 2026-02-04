from beancount import loader
from beancount.core.data import Transaction
from app.core.config import settings
from typing import List, Tuple, Any, Callable

class BeancountService:
    def __init__(self, filepath: str, loader_func: Callable = loader.load_file):
        self.filepath = filepath
        self.loader_func = loader_func
        self._entries = []
        self._errors = []
        self._options = {}
        self._loaded = False

    def load(self) -> None:
        """Loads and parses the beancount file."""
        # If loader is load_string, filepath plays a different role or is ignored, 
        # but standard beancount usage is load_file(path) or load_string(content)
        # We will adapt based on the callable signature if needed, but for now assume compatible
        self._entries, self._errors, self._options = self.loader_func(self.filepath)
        self._loaded = True

    @property
    def entries(self) -> List[Any]:
        if not self._loaded:
             self.load()
        return self._entries

    def get_transactions(self) -> List[Transaction]:
        return [entry for entry in self.entries if isinstance(entry, Transaction)]

# Dependency for FastAPI
def get_beancount_service():
    return BeancountService(settings.beancount_file)
