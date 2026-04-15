"""Report Generator for AWS Well-Architected Review Tool.

Generates self-contained HTML reports and JSON output files
from scan results.
"""

from __future__ import annotations

import json
import logging
from collections import Counter
from pathlib import Path
from typing import Any

from core.models import Finding, Pillar, ScanResult, Severity

logger = logging.getLogger(__name__)


class ReportGenerator:
    """Generate HTML and JSON reports from scan results."""

    def generate_html(self, scan_result: ScanResult, output_dir: str) -> str:
        """Generate a self-contained HTML report. Returns the file path."""
        out = Path(output_dir)
        out.mkdir(parents=True, exist_ok=True)
        path = out / "report.html"
        summary = self._build_summary(scan_result)
        html = self._render_html(scan_result, summary)
        path.write_text(html, encoding="utf-8")
        logger.info("HTML report written to %s", path)
        return str(path)

    def generate_json_raw(self, scan_result: ScanResult, output_dir: str) -> str:
        """Generate api-raw.json with raw findings data. Returns file path."""
        out = Path(output_dir)
        out.mkdir(parents=True, exist_ok=True)
        path = out / "api-raw.json"
        data = {
            "scan_id": scan_result.scan_id,
            "status": scan_result.status.value,
            "started_at": scan_result.started_at.isoformat(),
            "completed_at": (
                scan_result.completed_at.isoformat()
                if scan_result.completed_at
                else None
            ),
            "findings": [f.model_dump(mode="json") for f in scan_result.findings],
            "suppressed_findings_count": len(scan_result.suppressed_findings),
            "errors": scan_result.errors,
            "resources_scanned": scan_result.resources_scanned,
        }
        path.write_text(json.dumps(data, indent=2, default=str), encoding="utf-8")
        logger.info("Raw JSON report written to %s", path)
        return str(path)

    def generate_json_full(self, scan_result: ScanResult, output_dir: str) -> str:
        """Generate api-full.json with findings + summary data. Returns file path."""
        out = Path(output_dir)
        out.mkdir(parents=True, exist_ok=True)
        path = out / "api-full.json"
        summary = self._build_summary(scan_result)
        data = {
            "scan_id": scan_result.scan_id,
            "status": scan_result.status.value,
            "started_at": scan_result.started_at.isoformat(),
            "completed_at": (
                scan_result.completed_at.isoformat()
                if scan_result.completed_at
                else None
            ),
            "summary": summary,
            "findings": [f.model_dump(mode="json") for f in scan_result.findings],
            "suppressed_findings_count": len(scan_result.suppressed_findings),
            "errors": scan_result.errors,
            "resources_scanned": scan_result.resources_scanned,
            "configuration": scan_result.configuration.model_dump(mode="json"),
        }
        path.write_text(json.dumps(data, indent=2, default=str), encoding="utf-8")
        logger.info("Full JSON report written to %s", path)
        return str(path)

    def generate_all(self, scan_result: ScanResult, output_dir: str) -> dict[str, str]:
        """Generate all report formats. Returns dict of format->path."""
        return {
            "html": self.generate_html(scan_result, output_dir),
            "json_raw": self.generate_json_raw(scan_result, output_dir),
            "json_full": self.generate_json_full(scan_result, output_dir),
        }

    # ------------------------------------------------------------------
    # Summary builder
    # ------------------------------------------------------------------

    def _build_summary(self, result: ScanResult) -> dict[str, Any]:
        findings = result.findings
        severity_counts = Counter(f.severity.value for f in findings)
        pillar_counts = Counter(f.pillar.value for f in findings)
        service_counts = Counter(f.service for f in findings)
        account_counts = Counter(f.account_id for f in findings)
        region_counts = Counter(f.region for f in findings)

        # Per-account breakdown
        accounts_summary: dict[str, dict] = {}
        for f in findings:
            if f.account_id not in accounts_summary:
                accounts_summary[f.account_id] = {
                    "total": 0,
                    "by_severity": {},
                    "by_pillar": {},
                }
            acct = accounts_summary[f.account_id]
            acct["total"] += 1
            acct["by_severity"][f.severity.value] = (
                acct["by_severity"].get(f.severity.value, 0) + 1
            )
            acct["by_pillar"][f.pillar.value] = (
                acct["by_pillar"].get(f.pillar.value, 0) + 1
            )

        # Heatmap: service x pillar
        heatmap: dict[str, dict[str, int]] = {}
        for f in findings:
            heatmap.setdefault(f.service, {})
            heatmap[f.service][f.pillar.value] = (
                heatmap[f.service].get(f.pillar.value, 0) + 1
            )

        return {
            "total_findings": len(findings),
            "suppressed_findings": len(result.suppressed_findings),
            "resources_scanned": result.resources_scanned,
            "errors_count": len(result.errors),
            "by_severity": dict(severity_counts),
            "by_pillar": dict(pillar_counts),
            "by_service": dict(service_counts),
            "by_account": dict(account_counts),
            "by_region": dict(region_counts),
            "accounts_detail": accounts_summary,
            "heatmap": heatmap,
        }

    # ------------------------------------------------------------------
    # HTML renderer
    # ------------------------------------------------------------------

    def _render_html(self, result: ScanResult, summary: dict) -> str:
        severity_colors = {
            "CRITICAL": "#d13212",
            "HIGH": "#ff9900",
            "MEDIUM": "#f2c744",
            "LOW": "#1d8102",
            "INFORMATIONAL": "#0073bb",
        }

        # Build findings JSON for JS filtering
        findings_json = json.dumps(
            [
                {
                    "account_id": f.account_id,
                    "region": f.region,
                    "service": f.service,
                    "resource_id": f.resource_id,
                    "severity": f.severity.value,
                    "pillar": f.pillar.value,
                    "title": f.title,
                    "description": f.description,
                    "recommendation": f.recommendation,
                    "documentation_url": f.documentation_url or "",
                }
                for f in result.findings
            ],
            default=str,
        )

        # Collect unique filter values
        accounts = sorted({f.account_id for f in result.findings})
        services = sorted({f.service for f in result.findings})
        regions = sorted({f.region for f in result.findings})
        pillars = [p.value for p in Pillar]
        severities = [s.value for s in Severity]

        def _options(values: list[str], label: str) -> str:
            opts = f'<option value="">All {label}</option>\n'
            for v in values:
                opts += f"<option value=\"{_esc(v)}\">{_esc(v)}</option>\n"
            return opts

        # Severity distribution bars
        severity_bars = ""
        for sev in severities:
            count = summary["by_severity"].get(sev, 0)
            color = severity_colors.get(sev, "#666")
            severity_bars += (
                f'<div style="display:flex;align-items:center;margin:4px 0">'
                f'<span style="width:140px;font-weight:500">{sev}</span>'
                f'<div style="background:{color};height:22px;'
                f"width:{max(count * 20, 2)}px;"
                f'border-radius:3px"></div>'
                f'<span style="margin-left:8px;font-weight:bold">{count}</span></div>\n'
            )

        # Pillar summary
        pillar_items = ""
        for p in Pillar:
            count = summary["by_pillar"].get(p.value, 0)
            pillar_items += f"<li><strong>{_esc(p.value)}</strong>: {count} findings</li>\n"

        # Per-account sections
        account_sections = ""
        if len(accounts) > 1:
            account_sections = "<h2>Results by Account</h2>\n"
            for acct_id in accounts:
                detail = summary["accounts_detail"].get(acct_id, {})
                total = detail.get("total", 0)
                by_sev = detail.get("by_severity", {})
                sev_parts = ", ".join(
                    f"{s}: {by_sev.get(s, 0)}" for s in severities if by_sev.get(s, 0)
                )
                account_sections += (
                    f'<div class="account-card">'
                    f"<h3>Account: {_esc(acct_id)}</h3>"
                    f"<p>Total findings: <strong>{total}</strong></p>"
                    f"<p>Severity: {_esc(sev_parts) if sev_parts else 'None'}</p>"
                    f"</div>\n"
                )

        # Errors section
        errors_section = ""
        if result.errors:
            errors_section = "<h2>Errors</h2><ul>\n"
            for err in result.errors:
                errors_section += f"<li>{_esc(err)}</li>\n"
            errors_section += "</ul>\n"

        completed = (
            result.completed_at.isoformat() if result.completed_at else "N/A"
        )

        return (
            "<!DOCTYPE html>\n"
            '<html lang="en"><head><meta charset="utf-8">\n'
            "<title>AWS Well-Architected Review Report</title>\n"
            "<style>\n"
            + _CSS
            + "\n</style>\n"
            "</head><body>\n"
            "<h1>AWS Well-Architected Review Report</h1>\n"
            f"<p>Scan ID: {_esc(result.scan_id)} | Status: {result.status.value} | "
            f"Started: {result.started_at.isoformat()} | Completed: {completed}</p>\n"
            "\n<h2>Summary Dashboard</h2>\n"
            '<div class="summary-grid">\n'
            f'<div class="card"><h3>Total Findings</h3><div class="value">{summary["total_findings"]}</div></div>\n'
            f'<div class="card"><h3>Suppressed</h3><div class="value">{summary["suppressed_findings"]}</div></div>\n'
            f'<div class="card"><h3>Resources Scanned</h3><div class="value">{summary["resources_scanned"]}</div></div>\n'
            f'<div class="card"><h3>Errors</h3><div class="value">{summary["errors_count"]}</div></div>\n'
            "</div>\n"
            "\n<h2>Severity Distribution</h2>\n"
            f"{severity_bars}\n"
            "\n<h2>Findings by Pillar</h2>\n"
            f"<ul>{pillar_items}</ul>\n"
            f"\n{account_sections}\n"
            f"{errors_section}\n"
            "\n<h2>Findings</h2>\n"
            '<div class="filters">\n'
            f'<select id="f-account" onchange="applyFilters()">{_options(accounts, "Accounts")}</select>\n'
            f'<select id="f-service" onchange="applyFilters()">{_options(services, "Services")}</select>\n'
            f'<select id="f-region" onchange="applyFilters()">{_options(regions, "Regions")}</select>\n'
            f'<select id="f-pillar" onchange="applyFilters()">{_options(pillars, "Pillars")}</select>\n'
            f'<select id="f-severity" onchange="applyFilters()">{_options(severities, "Severities")}</select>\n'
            '<input id="f-search" type="text" placeholder="Search findings..." oninput="applyFilters()">\n'
            "</div>\n"
            '<table id="findings-table"><thead><tr>\n'
            "<th>Account</th><th>Region</th><th>Service</th><th>Resource</th>\n"
            "<th>Severity</th><th>Pillar</th><th>Title</th>\n"
            "<th>Recommendation</th><th>Docs</th>\n"
            "</tr></thead><tbody id=\"findings-body\">\n"
            "</tbody></table>\n"
            '<p id="findings-count"></p>\n'
            "\n<footer>Generated by AWS Well-Architected Review Tool</footer>\n"
            f"\n<script>\nvar ALL_FINDINGS = {findings_json};\n"
            + _JS
            + "\n</script>\n"
            "</body></html>"
        )


# ------------------------------------------------------------------
# Constants
# ------------------------------------------------------------------

_CSS = """\
body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;margin:20px;background:#fafafa;color:#16191f}
h1{color:#232f3e}
h2{color:#232f3e;border-bottom:2px solid #ff9900;padding-bottom:6px}
table{border-collapse:collapse;width:100%}
th,td{border:1px solid #d5dbdb;padding:8px;text-align:left;font-size:13px}
th{background:#232f3e;color:#fff;position:sticky;top:0}
tr:nth-child(even){background:#f2f3f3}
.card{background:#fff;border:1px solid #d5dbdb;border-radius:8px;padding:16px;margin:8px;display:inline-block;min-width:180px}
.card h3{margin:0 0 8px;font-size:14px;color:#545b64}
.card .value{font-size:28px;font-weight:bold;color:#16191f}
.summary-grid{display:flex;flex-wrap:wrap;gap:8px;margin:16px 0}
.account-card{background:#fff;border:1px solid #d5dbdb;border-radius:8px;padding:12px 16px;margin:8px 0;display:inline-block;min-width:250px;vertical-align:top}
.account-card h3{margin:0 0 6px;font-size:15px;color:#232f3e}
.account-card p{margin:2px 0;font-size:13px}
.filters{margin:12px 0;display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.filters select,.filters input{padding:6px 10px;border:1px solid #d5dbdb;border-radius:4px;font-size:13px}
.filters input{min-width:200px}
a.doc-link{color:#0073bb;text-decoration:none}
a.doc-link:hover{text-decoration:underline}
footer{margin-top:20px;color:#545b64;font-size:12px}"""

_JS = """\
var SEV_COLORS={"CRITICAL":"#d13212","HIGH":"#ff9900","MEDIUM":"#f2c744","LOW":"#1d8102","INFORMATIONAL":"#0073bb"};
function applyFilters(){
  var fa=document.getElementById("f-account").value;
  var fs=document.getElementById("f-service").value;
  var fr=document.getElementById("f-region").value;
  var fp=document.getElementById("f-pillar").value;
  var fv=document.getElementById("f-severity").value;
  var ft=document.getElementById("f-search").value.toLowerCase();
  var tbody=document.getElementById("findings-body");
  tbody.innerHTML="";
  var count=0;
  ALL_FINDINGS.forEach(function(f){
    if(fa&&f.account_id!==fa)return;
    if(fs&&f.service!==fs)return;
    if(fr&&f.region!==fr)return;
    if(fp&&f.pillar!==fp)return;
    if(fv&&f.severity!==fv)return;
    if(ft){
      var hay=(f.title+" "+f.description+" "+f.recommendation+" "+f.resource_id+" "+f.service).toLowerCase();
      if(hay.indexOf(ft)===-1)return;
    }
    var color=SEV_COLORS[f.severity]||"#666";
    var docCell=f.documentation_url?'<a class="doc-link" href="'+esc(f.documentation_url)+'" target="_blank" rel="noopener">View</a>':"";
    var tr=document.createElement("tr");
    tr.innerHTML="<td>"+esc(f.account_id)+"</td><td>"+esc(f.region)+"</td>"
      +"<td>"+esc(f.service)+"</td><td>"+esc(f.resource_id)+"</td>"
      +'<td style="color:'+color+';font-weight:bold">'+esc(f.severity)+"</td>"
      +"<td>"+esc(f.pillar)+"</td><td>"+esc(f.title)+"</td>"
      +"<td>"+esc(f.recommendation)+"</td><td>"+docCell+"</td>";
    tbody.appendChild(tr);
    count++;
  });
  document.getElementById("findings-count").textContent="Showing "+count+" of "+ALL_FINDINGS.length+" findings";
}
function esc(s){
  if(!s)return"";
  var d=document.createElement("div");d.appendChild(document.createTextNode(s));return d.innerHTML;
}
applyFilters();"""


def _esc(text: str) -> str:
    """Escape HTML special characters."""
    return (
        str(text)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )
