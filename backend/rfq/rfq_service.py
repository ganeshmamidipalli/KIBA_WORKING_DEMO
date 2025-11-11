"""
RFQ Generation Service
======================

Generate professional RFQ/PMO documents from user selections and AI vendor recommendations.

Features:
- Template-based generation (HTML → PDF or DOCX)
- Fixed boilerplate text from config
- Dynamic fields from user input and selected vendors
- Automatic competitive procurement statement when 2+ vendors selected
- Vendor comparison table
"""

import os
import yaml
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional
from pathlib import Path
from jinja2 import Template

# Get paths
RFQ_DIR = Path(__file__).parent
TEMPLATE_DIR = RFQ_DIR / "templates"
OUTPUT_DIR = RFQ_DIR / "generated"
CONFIG_FILE = RFQ_DIR / "rfq_config.yaml"

# Ensure output directory exists
OUTPUT_DIR.mkdir(exist_ok=True, parents=True)

# Load configuration
def load_config() -> Dict[str, Any]:
    """Load RFQ configuration from YAML file."""
    if not CONFIG_FILE.exists():
        return {
            "boilerplate": {"instruments": [], "competitive_def": "", "compliance_notes": []},
            "sections": {},
            "defaults": {}
        }
    with open(CONFIG_FILE, 'r') as f:
        return yaml.safe_load(f)

CONFIG = load_config()


class RFQPayload:
    """RFQ payload data structure."""
    
    def __init__(
        self,
        # Meta
        rfq_id: Optional[str] = None,
        
        # Procurement info (from user input in app)
        procurement_kind: str = "Purchase Order",
        service_program: str = "Applied Research",
        kmi_technical_poc: str = "",
        projects_supported: List[str] = None,
        estimated_cost: float = 0.0,
        pop_start: str = "",
        pop_end: str = "",
        suggested_type: str = "Purchase Order",
        competition_type: str = "Competitive",
        
        # Product & scope (from earlier steps)
        product_name: str = "",
        scope_brief: str = "",
        selected_variant: Optional[Dict[str, Any]] = None,
        
        # Vendors (AI top 10 + user selected 1-3)
        ai_ranked_vendors: List[Dict[str, Any]] = None,
        selected_vendor_ids: List[str] = None,
        
        # Attachments
        attachments: List[Dict[str, Any]] = None
    ):
        self.meta = {
            "rfq_id": rfq_id or self._generate_rfq_id(),
            "created_at": datetime.now().strftime("%Y-%m-%d"),
            "created_datetime": datetime.now().isoformat(),
            "company_name": CONFIG.get("defaults", {}).get("company_name", "Knowmadics"),
            "validity_days": CONFIG.get("defaults", {}).get("validity_days", 30),
            "valid_until": (datetime.now() + timedelta(days=30)).strftime("%Y-%m-%d")
        }
        
        # Parse KMI Technical POC for signature section
        # Expected format: "Name" or "Name, Position" or "Name\nEmail\nPhone" etc.
        self.signature = self._parse_poc_for_signature(kmi_technical_poc)
        
        self.procurement = {
            "kind": procurement_kind,
            "program": service_program,
            "kmi_technical_poc": kmi_technical_poc,
            "projects_supported": projects_supported or [],
            "estimated_cost": estimated_cost,
            "pop_start": pop_start,
            "pop_end": pop_end,
            "suggested_type": suggested_type,
            "competition_type": competition_type,
            "multiple_vendors_available": len(selected_vendor_ids or []) >= 2
        }
        
        self.product = {
            "name": product_name,
            "variant": selected_variant or {}
        }
        
        self.scope_brief = scope_brief
        
        # Vendor data
        self.vendors = {
            "ai_ranked_top10": ai_ranked_vendors or [],
            "selected": selected_vendor_ids or []
        }
        
        # Build vendor lookup for easy template access
        self.vendor_by_id = {v["id"]: v for v in (ai_ranked_vendors or [])}
        
        # Get selected vendor details
        self.selected_vendors = [
            self.vendor_by_id.get(vid) 
            for vid in (selected_vendor_ids or []) 
            if vid in self.vendor_by_id
        ]
        
        self.attachments = attachments or []
        
        # Flags for template logic
        self.is_competitive = len(self.selected_vendors) >= 2
        self.is_single_vendor = len(self.selected_vendors) == 1
        
        # Load boilerplate from config
        self.boilerplate = CONFIG.get("boilerplate", {})
        self.sections = CONFIG.get("sections", {})
    
    def _generate_rfq_id(self) -> str:
        """Generate unique RFQ ID."""
        prefix = CONFIG.get("defaults", {}).get("rfq_prefix", "RFQ")
        timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        return f"{prefix}-{timestamp}"
    
    def _parse_poc_for_signature(self, poc_string: str) -> Dict[str, str]:
        """
        Parse KMI Technical POC string to extract name, position, email, phone.
        
        Expected formats:
        - "John Doe"
        - "John Doe, Senior Engineer"
        - "John Doe\njohn@example.com\n555-1234"
        - "John Doe\nSenior Engineer\njohn@example.com\n555-1234"
        """
        if not poc_string:
            return {
                "name": "",
                "position": "",
                "email": "",
                "phone": ""
            }
        
        import re
        lines = [line.strip() for line in poc_string.split('\n') if line.strip()]
        parts = [part.strip() for part in poc_string.split(',') if part.strip()]
        
        signature = {
            "name": "",
            "position": "",
            "email": "",
            "phone": ""
        }
        
        # Try to parse email and phone from lines
        email_pattern = r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b'
        
        if lines:
            # First line is usually name
            signature["name"] = lines[0]
            
            # Check if first line has comma (name, position)
            if ',' in lines[0]:
                name_parts = lines[0].split(',', 1)
                signature["name"] = name_parts[0].strip()
                signature["position"] = name_parts[1].strip()
            elif len(lines) > 1:
                # Second line might be position or email
                second_line = lines[1]
                if '@' in second_line:
                    email_match = re.search(email_pattern, second_line)
                    if email_match:
                        signature["email"] = email_match.group()
                else:
                    signature["position"] = second_line
            
            # Look for email in remaining lines
            for line in lines[1:]:
                if '@' in line and not signature["email"]:
                    email_match = re.search(email_pattern, line)
                    if email_match:
                        signature["email"] = email_match.group()
                # Look for phone
                if not signature["phone"]:
                    # Simple phone detection
                    if re.search(r'\d{3}[\s\-]?\d{3}[\s\-]?\d{4}', line) or re.search(r'\+?\d[\d\s\-\(\)]{7,}', line):
                        signature["phone"] = line
        
        # If comma-separated format (name, position)
        elif len(parts) >= 2:
            signature["name"] = parts[0]
            signature["position"] = parts[1]
        
        return signature
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for template rendering."""
        return {
            "meta": self.meta,
            "procurement": self.procurement,
            "product": self.product,
            "scope_brief": self.scope_brief,
            "vendors": self.vendors,
            "vendor_by_id": self.vendor_by_id,
            "selected_vendors": self.selected_vendors,
            "attachments": self.attachments,
            "is_competitive": self.is_competitive,
            "is_single_vendor": self.is_single_vendor,
            "boilerplate": self.boilerplate,
            "sections": self.sections,
            "signature": self.signature
        }


def generate_rfq_html(payload: RFQPayload) -> str:
    """
    Generate RFQ as HTML from template.
    
    Args:
        payload: RFQPayload with all RFQ data
        
    Returns:
        str: Generated HTML content
    """
    template_path = TEMPLATE_DIR / "rfq_template.html"
    
    if not template_path.exists():
        # Use inline template if file doesn't exist
        template_content = _get_default_template()
    else:
        with open(template_path, 'r') as f:
            template_content = f.read()
    
    template = Template(template_content)
    html = template.render(**payload.to_dict())
    
    return html


def save_rfq(payload: RFQPayload, format: str = "html") -> Dict[str, Any]:
    """
    Generate and save RFQ document.
    
    Args:
        payload: RFQPayload with all RFQ data
        format: Output format ('html' or 'pdf')
        
    Returns:
        Dict with file path, download URL, and metadata
    """
    # Generate HTML
    html_content = generate_rfq_html(payload)
    
    # Save HTML
    html_filename = f"{payload.meta['rfq_id']}.html"
    html_path = OUTPUT_DIR / html_filename
    
    with open(html_path, 'w', encoding='utf-8') as f:
        f.write(html_content)
    
    result = {
        "rfq_id": payload.meta['rfq_id'],
        "html_path": str(html_path),
        "html_url": f"/api/rfq/download/{html_filename}",
        "created_at": payload.meta['created_at'],
        "vendor_count": len(payload.selected_vendors),
        "is_competitive": payload.is_competitive
    }
    
    # TODO: Convert to PDF if requested (using wkhtmltopdf or similar)
    if format == "pdf":
        result["note"] = "PDF generation not yet implemented - HTML available"
    
    return result


def _get_default_template() -> str:
    """Get default HTML template if file doesn't exist."""
    return """<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>{{ meta.rfq_id }} - Request for Quotation</title>
    <style>
        body {
            font-family: 'Segoe UI', Arial, sans-serif;
            line-height: 1.6;
            max-width: 8.5in;
            margin: 0 auto;
            padding: 1in;
            color: #333;
        }
        .header {
            border-bottom: 3px solid #0066cc;
            padding-bottom: 20px;
            margin-bottom: 30px;
        }
        .company-name {
            font-size: 24px;
            font-weight: bold;
            color: #0066cc;
            margin-bottom: 5px;
        }
        .rfq-title {
            font-size: 32px;
            font-weight: bold;
            color: #333;
            margin: 20px 0;
        }
        .section {
            margin: 30px 0;
        }
        .section-title {
            font-size: 18px;
            font-weight: bold;
            color: #0066cc;
            margin-bottom: 15px;
            border-bottom: 2px solid #eee;
            padding-bottom: 5px;
        }
        .field-group {
            margin: 15px 0;
        }
        .field-label {
            font-weight: 600;
            color: #555;
            display: inline-block;
            width: 200px;
        }
        .field-value {
            color: #333;
        }
        .vendor-table {
            width: 100%;
            border-collapse: collapse;
            margin: 20px 0;
        }
        .vendor-table th {
            background: #0066cc;
            color: white;
            padding: 12px;
            text-align: left;
            font-weight: 600;
        }
        .vendor-table td {
            border: 1px solid #ddd;
            padding: 10px;
        }
        .vendor-table tr:nth-child(even) {
            background: #f9f9f9;
        }
        .alert-box {
            background: #fff3cd;
            border-left: 4px solid #ffc107;
            padding: 15px;
            margin: 20px 0;
        }
        .success-box {
            background: #d4edda;
            border-left: 4px solid #28a745;
            padding: 15px;
            margin: 20px 0;
        }
        ul {
            margin: 10px 0;
            padding-left: 25px;
        }
        li {
            margin: 8px 0;
        }
        .footer {
            margin-top: 50px;
            padding-top: 20px;
            border-top: 2px solid #eee;
            font-size: 12px;
            color: #666;
        }
    </style>
</head>
<body>
    <!-- Header -->
    <div class="header">
        <div class="company-name">{{ meta.company_name }}</div>
        <div class="rfq-title">Request for Quotation</div>
        <div style="color: #666; font-size: 14px;">
            <strong>RFQ ID:</strong> {{ meta.rfq_id }}<br>
            <strong>Date Issued:</strong> {{ meta.created_at }}<br>
            <strong>Valid Until:</strong> {{ meta.valid_until }}
        </div>
    </div>

    <!-- Procurement Information -->
    <div class="section">
        <div class="section-title">Procurement Information</div>
        <div class="field-group">
            <span class="field-label">Procurement Instrument:</span>
            <span class="field-value">{{ procurement.kind }}</span>
        </div>
        <div class="field-group">
            <span class="field-label">Service Program:</span>
            <span class="field-value">{{ procurement.program }}</span>
        </div>
        <div class="field-group">
            <span class="field-label">KMI Technical POC:</span>
            <span class="field-value">{{ procurement.kmi_technical_poc }}</span>
        </div>
        <div class="field-group">
            <span class="field-label">KMI Project(s) Supported:</span>
            <span class="field-value">{{ procurement.projects_supported | join(', ') }}</span>
        </div>
        <div class="field-group">
            <span class="field-label">Estimated Cost:</span>
            <span class="field-value">${{ "{:,.2f}".format(procurement.estimated_cost) }}</span>
        </div>
        <div class="field-group">
            <span class="field-label">Period of Performance:</span>
            <span class="field-value">{{ procurement.pop_start }} to {{ procurement.pop_end }}</span>
        </div>
        <div class="field-group">
            <span class="field-label">Competition Type:</span>
            <span class="field-value">{{ procurement.competition_type }}</span>
        </div>
        <div class="field-group">
            <span class="field-label">Multiple Vendors Available:</span>
            <span class="field-value">{{ 'Yes' if procurement.multiple_vendors_available else 'No' }}</span>
        </div>
    </div>

    <!-- Scope & Requirements -->
    <div class="section">
        <div class="section-title">Scope of Work</div>
        <div style="white-space: pre-wrap; background: #f8f9fa; padding: 15px; border-radius: 5px;">{{ scope_brief }}</div>
    </div>

    <!-- Product Specifications -->
    {% if product.variant and product.variant.metrics %}
    <div class="section">
        <div class="section-title">Product Specifications - {{ product.variant.title }}</div>
        
        <div class="field-group">
            <span class="field-label">Product:</span>
            <span class="field-value">{{ product.name }}</span>
        </div>
        <div class="field-group">
            <span class="field-label">Quantity:</span>
            <span class="field-value">{{ product.variant.quantity }}</span>
        </div>
        <div class="field-group">
            <span class="field-label">Unit Price Estimate:</span>
            <span class="field-value">${{ "{:,.2f}".format(product.variant.est_unit_price_usd) }}</span>
        </div>
        <div class="field-group">
            <span class="field-label">Total Estimate:</span>
            <span class="field-value">${{ "{:,.2f}".format(product.variant.est_total_usd) }}</span>
        </div>
        
        <h4 style="margin-top: 20px; color: #0066cc;">Technical Specifications:</h4>
        <ul>
        {% for key, value in product.variant.metrics.items() %}
            <li><strong>{{ key }}:</strong> {{ value }}</li>
        {% endfor %}
        </ul>
        
        {% if product.variant.must %}
        <h4 style="margin-top: 20px; color: #dc3545;">Mandatory Requirements:</h4>
        <ul>
        {% for req in product.variant.must %}
            <li><strong>{{ req.key }}:</strong> {{ req.value }}</li>
        {% endfor %}
        </ul>
        {% endif %}
        
        {% if product.variant.should %}
        <h4 style="margin-top: 20px; color: #ffc107;">Strongly Preferred:</h4>
        <ul>
        {% for req in product.variant.should %}
            <li><strong>{{ req.key }}:</strong> {{ req.value }}</li>
        {% endfor %}
        </ul>
        {% endif %}
    </div>
    {% endif %}

    <!-- Vendor Evaluation -->
    <div class="section">
        <div class="section-title">{{ sections.vendor_evaluation_title or 'Vendor Evaluation' }}</div>
        
        {% if is_competitive %}
        <div class="success-box">
            <strong>Competitive Procurement:</strong> {{ selected_vendors | length }} vendors have been evaluated and invited to quote.
        </div>
        
        <table class="vendor-table">
            <thead>
                <tr>
                    <th>Vendor</th>
                    <th>Location</th>
                    <th>Contact</th>
                    <th>Price Estimate</th>
                    <th>Lead Time</th>
                    <th>AI Score</th>
                </tr>
            </thead>
            <tbody>
            {% for vendor in selected_vendors %}
                <tr>
                    <td><strong>{{ vendor.name }}</strong></td>
                    <td>{{ vendor.location or '—' }}</td>
                    <td>{{ vendor.contact or '—' }}</td>
                    <td>${{ "{:,.2f}".format(vendor.price_estimate) if vendor.price_estimate else '—' }}</td>
                    <td>{{ vendor.lead_time_days or '—' }} days</td>
                    <td>{{ "{:.0f}".format((vendor.score or 0) * 100) }}%</td>
                </tr>
            {% endfor %}
            </tbody>
        </table>
        
        {% else %}
        <div class="alert-box">
            <strong>Single Vendor:</strong> {{ selected_vendors[0].name if selected_vendors else 'No vendor selected' }}
        </div>
        
        {% if selected_vendors %}
        <div class="field-group">
            <span class="field-label">Vendor Name:</span>
            <span class="field-value">{{ selected_vendors[0].name }}</span>
        </div>
        <div class="field-group">
            <span class="field-label">Location:</span>
            <span class="field-value">{{ selected_vendors[0].location or 'N/A' }}</span>
        </div>
        <div class="field-group">
            <span class="field-label">Contact:</span>
            <span class="field-value">{{ selected_vendors[0].contact or 'N/A' }}</span>
        </div>
        <div class="field-group">
            <span class="field-label">Price Estimate:</span>
            <span class="field-value">${{ "{:,.2f}".format(selected_vendors[0].price_estimate) if selected_vendors[0].price_estimate else 'TBD' }}</span>
        </div>
        <div class="field-group">
            <span class="field-label">Lead Time:</span>
            <span class="field-value">{{ selected_vendors[0].lead_time_days or 'TBD' }} days</span>
        </div>
        {% endif %}
        {% endif %}
    </div>

    <!-- Standard Definitions (ALWAYS INCLUDED) -->
    <div class="section">
        <div class="section-title">{{ sections.instruments_title or 'Procurement Instrument Definitions' }}</div>
        <ul>
        {% for definition in boilerplate.instruments %}
            <li>{{ definition }}</li>
        {% endfor %}
        </ul>
    </div>

    <!-- Competitive Statement (ONLY when 2+ vendors) -->
    {% if is_competitive %}
    <div class="section">
        <div class="section-title">{{ sections.competitive_title or 'Competitive Procurement Statement' }}</div>
        <p>{{ boilerplate.competitive_def }}</p>
    </div>
    {% endif %}

    <!-- Compliance Requirements -->
    {% if boilerplate.compliance_notes %}
    <div class="section">
        <div class="section-title">{{ sections.compliance_title or 'Vendor Compliance Requirements' }}</div>
        <ul>
        {% for note in boilerplate.compliance_notes %}
            <li>{{ note }}</li>
        {% endfor %}
        </ul>
    </div>
    {% endif %}

    <!-- Signature Section -->
    <div class="section" style="margin-top: 60px;">
        <div class="section-title">Authorized Signature</div>
        <div style="margin-top: 40px;">
            <div style="margin-bottom: 60px;">
                <div style="font-weight: bold; font-size: 16px; margin-bottom: 5px;">{{ meta.company_name }}</div>
                {% if signature.name %}
                <div style="margin-top: 40px;">
                    <div style="margin-bottom: 5px;">{{ signature.name }}</div>
                    {% if signature.position %}
                    <div style="color: #666; font-size: 14px; margin-bottom: 5px;">{{ signature.position }}</div>
                    {% endif %}
                    {% if signature.email %}
                    <div style="color: #666; font-size: 14px; margin-bottom: 5px;">{{ signature.email }}</div>
                    {% endif %}
                    {% if signature.phone %}
                    <div style="color: #666; font-size: 14px; margin-bottom: 5px;">{{ signature.phone }}</div>
                    {% endif %}
                </div>
                {% else %}
                <div style="margin-top: 40px;">
                    <div style="margin-bottom: 5px;">{{ procurement.kmi_technical_poc }}</div>
                </div>
                {% endif %}
            </div>
        </div>
    </div>

    <!-- Footer -->
    <div class="footer">
        <p>This RFQ was generated by the Knowmadics AI Procurement Assistant on {{ meta.created_datetime }}.</p>
        <p>Vendors must respond by {{ meta.valid_until }} with complete pricing, lead times, and compliance certifications.</p>
    </div>
</body>
</html>
"""


def validate_payload(payload_dict: Dict[str, Any]) -> tuple[bool, Optional[str]]:
    """
    Validate RFQ payload before generation.
    
    Returns:
        (is_valid, error_message)
    """
    selected = payload_dict.get("selected_vendor_ids", [])
    
    if not selected:
        return False, "At least 1 vendor must be selected"
    
    if len(selected) > 3:
        return False, "Maximum 3 vendors can be selected"
    
    if not payload_dict.get("product_name"):
        return False, "Product name is required"
    
    if not payload_dict.get("scope_brief"):
        return False, "Scope of work is required"
    
    if not payload_dict.get("kmi_technical_poc"):
        return False, "KMI Technical POC is required"
    
    return True, None

