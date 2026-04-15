"""Lambda check evaluation functions.

Each function takes a ResourceData object and returns True if the resource
PASSES the check (is compliant), or False if it FAILS (non-compliant).
"""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from core.models import ResourceData

# Runtimes that AWS has deprecated or marked end-of-support
DEPRECATED_RUNTIMES = frozenset({
    "python2.7",
    "python3.6",
    "python3.7",
    "nodejs10.x",
    "nodejs12.x",
    "nodejs14.x",
    "nodejs16.x",
    "dotnetcore2.1",
    "dotnetcore3.1",
    "dotnet5.0",
    "dotnet6",
    "ruby2.5",
    "ruby2.7",
    "java8",
    "go1.x",
    "provided",
})


def check_default_memory(resource: ResourceData) -> bool:
    """Check that the Lambda function is not using the default memory size.

    Returns True (pass) if memory_size is not 128 MB (the default).
    A function left at 128 MB likely hasn't been tuned for its workload.
    """
    config = resource.configuration
    memory = config.get("memory_size")

    if memory is None:
        return True

    try:
        return int(memory) != 128
    except (TypeError, ValueError):
        return True


def check_dead_letter_queue(resource: ResourceData) -> bool:
    """Check that the Lambda function has a dead letter queue configured.

    Returns True (pass) if a DLQ target ARN is set in 'dead_letter_config'
    or 'dead_letter_arn' is present.
    """
    config = resource.configuration

    # Direct ARN field
    if config.get("dead_letter_arn"):
        return True

    # Nested config from GetFunctionConfiguration
    dlq_config = config.get("dead_letter_config", {})
    if isinstance(dlq_config, dict):
        return bool(dlq_config.get("target_arn"))

    return False


def check_runtime_deprecated(resource: ResourceData) -> bool:
    """Check that the Lambda function is not using a deprecated runtime.

    Returns True (pass) if the runtime is not in the deprecated list.
    """
    config = resource.configuration
    runtime = config.get("runtime", "")

    if not runtime:
        # Custom runtimes or container images — not applicable
        return True

    return runtime.lower() not in DEPRECATED_RUNTIMES
