"""VPC checks for Well-Architected Review."""


def check_flow_logs_enabled(resource):
    """Returns True if PASSES — VPC has flow logs enabled."""
    flow_logs = resource.configuration.get("FlowLogs", [])
    return len(flow_logs) > 0


def check_default_sg_restricts_traffic(resource):
    """Returns True if PASSES — default SG has no inbound/outbound rules."""
    is_default = resource.configuration.get("GroupName") == "default"
    if not is_default:
        return True
    inbound = resource.configuration.get("IpPermissions", [])
    outbound = resource.configuration.get("IpPermissionsEgress", [])
    return len(inbound) == 0 and len(outbound) == 0


def check_nacl_no_unrestricted_ssh(resource):
    """Returns True if PASSES — NACL does not allow unrestricted SSH (port 22)."""
    entries = resource.configuration.get("Entries", [])
    for entry in entries:
        if entry.get("RuleAction") != "allow" or entry.get("Egress", False):
            continue
        cidr = entry.get("CidrBlock", "")
        port_range = entry.get("PortRange", {})
        from_port = port_range.get("From", 0)
        to_port = port_range.get("To", 0)
        if cidr == "0.0.0.0/0" and from_port <= 22 <= to_port:
            return False
    return True
