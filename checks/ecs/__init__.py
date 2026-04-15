"""ECS check evaluation functions.

Each function takes a ResourceData object and returns True if the resource
PASSES the check (is compliant), or False if it FAILS (non-compliant).
"""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from core.models import ResourceData


def check_circuit_breaker_enabled(resource: ResourceData) -> bool:
    """Check that the ECS service has a deployment circuit breaker enabled.

    Returns True (pass) if 'deployment_circuit_breaker.enable' is True or
    'circuit_breaker_enabled' is True.
    """
    config = resource.configuration

    if config.get("circuit_breaker_enabled") is True:
        return True

    # Nested structure from DescribeServices
    deployment_config = config.get("deployment_configuration", {})
    if isinstance(deployment_config, dict):
        circuit_breaker = deployment_config.get("deployment_circuit_breaker", {})
        if isinstance(circuit_breaker, dict):
            return bool(circuit_breaker.get("enable", False))

    return False


def check_container_insights_enabled(resource: ResourceData) -> bool:
    """Check that Container Insights is enabled on the ECS cluster.

    Returns True (pass) if 'container_insights' is 'enabled' or
    the cluster settings include containerInsights set to enabled.
    """
    config = resource.configuration

    if config.get("container_insights_enabled") is True:
        return True

    insights = config.get("container_insights", "")
    if isinstance(insights, str) and insights.lower() == "enabled":
        return True

    # Cluster settings from DescribeClusters
    settings = config.get("settings", [])
    if isinstance(settings, list):
        for setting in settings:
            if isinstance(setting, dict):
                name = setting.get("name", "")
                value = setting.get("value", "")
                if name == "containerInsights" and value.lower() == "enabled":
                    return True

    return False
