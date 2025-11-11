from __future__ import annotations
import hashlib
import json
import os
from pathlib import Path
from typing import Dict, Any, Tuple
from datetime import datetime, timezone

from jinja2 import Environment, FileSystemLoader, select_autoescape

from .schema import ProcurementDocumentV1


BASE_DIR = Path(__file__).parent
TEMPLATES_DIR = BASE_DIR / "templates"
OUTPUT_DIR = BASE_DIR / "generated"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


def _format_currency(value: Any) -> str:
    try:
        num = float(value)
        return f"${num:,.2f}"
    except Exception:
        return "—"


def _nl2br(text: str | None) -> str:
    if not text:
        return ""
    return (text or "").replace("\n", "<br/>")


def _get_env() -> Environment:
    env = Environment(
        loader=FileSystemLoader(str(TEMPLATES_DIR)),
        autoescape=select_autoescape(["html", "xml"]),
        trim_blocks=True,
        lstrip_blocks=True,
    )
    env.filters["formatCurrency"] = _format_currency
    env.filters["nl2br"] = _nl2br
    return env


def _ensure_template() -> None:
    TEMPLATES_DIR.mkdir(parents=True, exist_ok=True)
    tpl = TEMPLATES_DIR / "procurement_summary.html"
    if not tpl.exists():
        tpl.write_text(_DEFAULT_TEMPLATE, encoding="utf-8")


def render_draft_html(payload: ProcurementDocumentV1) -> Tuple[str, Dict[str, Any]]:
    """Render the HTML draft and return (html, warnings)."""
    _ensure_template()
    env = _get_env()
    template = env.get_template("procurement_summary.html")
    data = payload.to_dict()

    # Basic warnings (example)
    warnings = []
    if payload.procurement.competitionType == 'Sole Source' and (
        not payload.vendors.selected.selectionRationale or len(payload.vendors.selected.selectionRationale) < 200
    ):
        warnings.append("Sole Source requires a justification of at least 200 characters.")

    html = template.render(**data, isDraft=True, warnings=warnings)
    return html, {"warnings": warnings}


def _hash_bytes(data: bytes) -> str:
    h = hashlib.sha256()
    h.update(data)
    return h.hexdigest()


def finalize_and_store(payload: ProcurementDocumentV1) -> Dict[str, Any]:
    """Freeze HTML, stamp version+hash, write files, return download info."""
    html, warning_info = render_draft_html(payload)
    html_bytes = html.encode("utf-8")
    doc_hash = _hash_bytes(html_bytes)

    # Directory: /generated/procurements/{id}/{version}/
    root = OUTPUT_DIR / "procurements" / payload.meta.requestId / payload.docVersion
    root.mkdir(parents=True, exist_ok=True)

    frozen_html = root / "final.html"
    frozen_json = root / "payload.json"
    frozen_meta = root / "meta.json"

    frozen_html.write_text(html, encoding="utf-8")
    frozen_json.write_text(json.dumps(payload.to_dict(), indent=2), encoding="utf-8")
    frozen_meta.write_text(json.dumps({
        "hash": doc_hash,
        "stampedAt": datetime.now(timezone.utc).isoformat(),
        "template": "procurement_summary.html",
        "version": payload.docVersion,
        "warnings": warning_info.get("warnings", []),
    }, indent=2), encoding="utf-8")

    # PDF/DOCX not implemented in this MVP
    return {
        "format": "html",
        "html_url": f"/api/procurements/{payload.meta.requestId}/download?format=html&version={payload.docVersion}",
        "pdf_url": None,
        "docx_url": None,
        "hash": doc_hash,
        "version": payload.docVersion,
        "warnings": warning_info.get("warnings", []),
    }


_DEFAULT_TEMPLATE = """<!DOCTYPE html>
<html>
<head>
  <meta charset=\"utf-8\" />
  <title>Procurement Summary – {{ meta.requestId }}</title>
  <style>
    body { font-family: -apple-system, Segoe UI, Arial, sans-serif; color: #222; max-width: 840px; margin: 0 auto; padding: 32px; }
    h1 { font-size: 28px; margin: 0 0 8px; }
    h2 { font-size: 18px; margin: 24px 0 8px; color: #0b5fff; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 8px; border-bottom: 1px solid #eee; }
    .meta { color: #555; font-size: 12px; margin-bottom: 16px; }
    .badge { display: inline-block; font-size: 12px; padding: 2px 8px; border-radius: 12px; background: #eef2ff; color: #334; margin-left: 8px; }
    .warning { background: #fff4d6; border-left: 4px solid #f4c10f; padding: 8px 12px; margin: 8px 0; font-size: 13px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 24px; }
    .small { font-size: 12px; color: #777; }
  </style>
  {% if isDraft %}<meta name=\"x-watermark\" content=\"DRAFT\" />{% endif %}
  </head>
<body>
  <h1>Procurement Summary <span class=\"badge\">v{{ docVersion }}</span></h1>
  <div class=\"meta\">
    Request ID: {{ meta.requestId }} • Created: {{ meta.createdAt }} • Env: {{ meta.environment }}
  </div>

  {% if warnings and warnings|length > 0 %}
  <div class=\"warning\">
    <strong>Warnings:</strong>
    <ul>
      {% for w in warnings %}<li>{{ w }}</li>{% endfor %}
    </ul>
  </div>
  {% endif %}

  <h2>Metadata</h2>
  <div class=\"grid\">
    <div><strong>Kind:</strong> {{ procurement.kind }}</div>
    <div><strong>Service Program:</strong> {{ procurement.serviceProgram }}</div>
    <div><strong>Technical POC:</strong> {{ procurement.technicalPOC.name }}</div>
    <div><strong>Projects Supported:</strong> {{ procurement.projectsSupported | join(', ') }}</div>
    <div><strong>Estimated Cost:</strong> {{ procurement.estimatedCost | formatCurrency }}</div>
    <div><strong>POP:</strong> {{ procurement.popStart }} – {{ procurement.popEnd }}</div>
    <div><strong>Competition Type:</strong> {{ procurement.competitionType }}</div>
    <div><strong>Multiple Vendors Available:</strong> {% if procurement.multipleVendorsAvailable %}Yes{% else %}No{% endif %}</div>
  </div>

  <h2>Scope Brief</h2>
  <div class=\"small\">Policy note: This section captures the key objectives and constraints for the procurement.</div>
  <div style=\"white-space: pre-wrap; background:#f9fafb; border:1px solid #eef; padding:12px; border-radius:6px;\">{{ procurement.scopeBrief }}</div>

  <h2>Vendor Evaluation</h2>
  <table>
    <thead><tr><th>Vendor</th><th>Quote</th><th>Lead Time</th><th>Notes</th></tr></thead>
    <tbody>
      {% for v in vendors.evaluated %}
      <tr>
        <td>{{ v.name }}</td>
        <td>{{ v.quoteAmount | formatCurrency }}</td>
        <td>{% if v.leadTimeDays %}{{ v.leadTimeDays }} days{% else %}—{% endif %}</td>
        <td>{{ v.notes or '' }}</td>
      </tr>
      {% endfor %}
    </tbody>
  </table>

  <h2>Selected Vendor</h2>
  <div class=\"grid\">
    <div><strong>Name:</strong> {{ vendors.selected.name }}</div>
    <div><strong>Total Award:</strong> {{ vendors.selected.totalAwardAmount | formatCurrency }}</div>
    <div><strong>Payment Terms:</strong> {{ vendors.selected.paymentTerms or '—' }}</div>
    <div><strong>Compliance:</strong> {{ vendors.selected.complianceChecks | join(', ') }}</div>
  </div>
  <div style=\"margin-top:8px;\"><strong>Selection Rationale:</strong><br/>{{ vendors.selected.selectionRationale | nl2br }}</div>

  {% if approvals and approvals|length > 0 %}
  <h2>Approvals</h2>
  <table>
    <thead><tr><th>Role</th><th>Name</th><th>Email</th><th>Approved At</th></tr></thead>
    <tbody>
      {% for a in approvals %}
      <tr>
        <td>{{ a.role }}</td>
        <td>{{ a.name }}</td>
        <td>{{ a.email or '—' }}</td>
        <td>{{ a.approvedAt or '—' }}</td>
      </tr>
      {% endfor %}
    </tbody>
  </table>
  {% endif %}

  {% if attachments and attachments|length > 0 %}
  <h2>Attachments</h2>
  <ul>
    {% for att in attachments %}
      <li>{{ att.title }} ({{ att.type }})</li>
    {% endfor %}
  </ul>
  {% endif %}

  <hr/>
  <div class=\"small\">This document is generated from a versioned schema ({{ docVersion }}). Finalized copies are immutable and hashed for audit.</div>
</body>
</html>
"""








