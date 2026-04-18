"""AWS Config checks for Well-Architected Review."""


def check_config_enabled(resource):
    """Returns True if PASSES — AWS Config recorder is active."""
    return resource.configuration.get("recording", False) is True
