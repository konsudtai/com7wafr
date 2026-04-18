"""CloudWatch checks for Well-Architected Review."""


def check_log_group_retention(resource):
    """Returns True if PASSES — log group has a retention policy set."""
    retention = resource.configuration.get("retentionInDays")
    return retention is not None and retention > 0


def check_metric_alarms(resource):
    """Returns True if PASSES — log group has associated metric filters/alarms."""
    metric_filters = resource.configuration.get("metricFilterCount", 0)
    return metric_filters > 0
