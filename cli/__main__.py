"""Allow running the CLI via ``python -m cli``."""

import sys

from cli.main import main

sys.exit(main())
