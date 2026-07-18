"""BTC maj/min chord recognition (Park et al., ISMIR 2019).

Vendored model code is MIT-licensed from https://github.com/jayg996/BTC-ISMIR19.
"""

from .infer import BTC_CHECKPOINT_ENV, BTC_MODEL_DIR_ENV, is_available, recognize

__all__ = [
    "BTC_CHECKPOINT_ENV",
    "BTC_MODEL_DIR_ENV",
    "is_available",
    "recognize",
]
