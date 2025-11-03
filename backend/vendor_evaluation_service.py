"""
Vendor Evaluation Service
=========================
Evaluate vendor information from URLs using LLM to extract complete details
for procurement documents and RFQ generation. Includes bot validation for
missing prices and automatic RFQ/Procurement letter generation.
"""

import os
import re
import json
import logging
from typing import Dict, Any, List, Optional, Tuple
from openai import OpenAI

try:
    import requests
    from bs4 import BeautifulSoup
    HAS_SCRAPING_DEPS = True
except ImportError:
    HAS_SCRAPING_DEPS = False
    logger.warning("beautifulsoup4 not available - web scraping will be disabled")

logger = logging.getLogger(__name__)

# Regular expression to detect money symbols in text
MONEY_PATTERN = re.compile(r"(?:USD|EUR|GBP|INR|\$|€|£|\d+\.\d+)\s*\d")

# Headers for web scraping
SCRAPING_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Procurement bot; contact: procurement@knowmadics.com)",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
    "Accept-Encoding": "gzip, deflate",
    "Connection": "keep-alive",
}


def fetch_page_html(url: str, timeout: int = 25) -> str:
    """
    Fetch HTML content from a URL.
    
    Args:
        url: URL to fetch
        timeout: Request timeout in seconds
        
    Returns:
        HTML content as string
        
    Raises:
        Exception: If fetching fails
    """
    if not HAS_SCRAPING_DEPS:
        raise ImportError("beautifulsoup4 or requests not installed")
    
    try:
        response = requests.get(url, headers=SCRAPING_HEADERS, timeout=timeout)
        response.raise_for_status()
        return response.text
    except requests.RequestException as e:
        logger.error(f"Failed to fetch {url}: {e}")
        raise


def html_to_text(html: str) -> str:
    """
    Convert HTML to clean text suitable for LLM processing.
    
    Args:
        html: HTML content
        
    Returns:
        Clean text with minimal formatting
    """
    if not HAS_SCRAPING_DEPS:
        raise ImportError("beautifulsoup4 not installed")
    
    soup = BeautifulSoup(html, "html.parser")
    
    # Remove script/style and other non-content tags
    for tag in soup(["script", "style", "noscript", "svg", "nav", "header", "footer"]):
        tag.decompose()
    
    # Get text and clean up whitespace
    text = soup.get_text("\n")
    # Remove excessive whitespace
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    return "\n".join(lines)


def analyze_missing_data(evaluated_vendors: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Analyze evaluated vendors to determine what data is present vs missing.
    
    Args:
        evaluated_vendors: List of vendor evaluation results
        
    Returns:
        Dictionary with presence/absence analysis and recommendations
    """
    needs_rfq = False
    missing_price_vendors = []
    present_fields_summary = []
    missing_fields_summary = []
    
    for vendor in evaluated_vendors:
        name = vendor.get('vendor_name', 'Unknown')
        pricing = vendor.get('pricing', {})
        contact = vendor.get('contact', {})
        availability = vendor.get('availability', {})
        
        # Check for price
        price_value = pricing.get('unit_price')
        price_text = pricing.get('notes', '')
        # Handle both numeric and string price values
        try:
            if price_value is not None:
                price_value = float(price_value) if isinstance(price_value, str) else price_value
                has_price = price_value > 0
            else:
                has_price = False
        except (ValueError, TypeError):
            has_price = False
        
        # Check if price is mentioned but not numeric
        if not has_price and price_text and MONEY_PATTERN.search(price_text):
            # Price mentioned but not properly extracted
            pass
        
        # Check contact info
        has_contact = bool(
            contact.get('sales_email') or 
            contact.get('sales_phone') or 
            contact.get('contact_url')
        )
        
        # Check availability
        has_lead_time = availability.get('lead_time_days') is not None
        has_availability = availability.get('in_stock') is not None
        
        # Track what's present
        present_fields = []
        missing_fields = []
        
        if has_price:
            present_fields.append('price')
        else:
            missing_fields.append('price')
            
        if has_contact:
            present_fields.append('contact')
        else:
            missing_fields.append('contact')
            
        if has_lead_time:
            present_fields.append('lead_time')
        else:
            missing_fields.append('lead_time')
            
        if has_availability:
            present_fields.append('availability')
        else:
            missing_fields.append('availability')
        
        # Check for SKU/model info
        if vendor.get('product_model'):
            present_fields.append('model')
        else:
            missing_fields.append('model')
        
        present_fields_summary.append({
            "name": name,
            "fields_present": present_fields
        })
        
        missing_fields_summary.append({
            "name": name,
            "fields_missing": missing_fields
        })
        
        # If price is missing, add to RFQ list
        if not has_price:
            needs_rfq = True
            missing_price_vendors.append(name)
    
    # Determine recommendation
    if needs_rfq:
        recommendation = (
            "Missing prices detected. Recommend sending RFQ to vendors "
            f"before proceeding: {', '.join(missing_price_vendors)}"
        )
    else:
        recommendation = (
            "All required fields (including price and contact) are present. "
            "Ready to proceed with procurement letter."
        )
    
    return {
        "needs_rfq": needs_rfq,
        "missing_price_vendors": missing_price_vendors,
        "present_summary": present_fields_summary,
        "missing_summary": missing_fields_summary,
        "recommendation": recommendation,
        "bot_check": {
            "block_next_step": needs_rfq,
            "block_reason": f"Missing prices for: {', '.join(missing_price_vendors)}" if needs_rfq else None
        }
    }


def evaluate_vendors_with_llm(
    vendors: List[Dict[str, Any]], 
    client: OpenAI,
    product_name: str,
    budget_usd: float,
    quantity: int
) -> List[Dict[str, Any]]:
    """
    Evaluate vendor information using LLM to extract complete details from URLs.
    
    Args:
        vendors: List of vendor dicts with at least 'name', 'url', 'price'
        client: OpenAI client
        product_name: Product being evaluated
        budget_usd: Budget per unit
        quantity: Quantity needed
        
    Returns:
        List of evaluated vendors with complete information
    """
    
    if not vendors:
        return []
    
    # Scrape vendor pages and prepare for LLM evaluation
    vendor_pages = []
    for i, vendor in enumerate(vendors[:5]):  # Evaluate top 5 vendors max
        url = vendor.get('purchase_url') or vendor.get('website') or vendor.get('url', '')
        name = vendor.get('vendor_name') or vendor.get('name', f'Vendor {i+1}')
        
        if not url or url == '#':
            logger.warning(f"Skipping vendor {name} - no valid URL")
            continue
        
        # Try to scrape the page
        page_text = ""
        try:
            if HAS_SCRAPING_DEPS:
                logger.info(f"Scraping page for {name}: {url}")
                html = fetch_page_html(url)
                page_text = html_to_text(html)
                logger.info(f"Successfully scraped {len(page_text)} chars from {url}")
            else:
                logger.warning(f"Scraping deps not available, skipping page scrape for {name}")
        except Exception as e:
            logger.warning(f"Failed to scrape {url}: {e}. Continuing with URL-only eval.")
        
        vendor_pages.append({
            'id': vendor.get('id', f'vendor_{i+1}'),
            'name': name,
            'url': url,
            'existing_price': vendor.get('price'),
            'page_text': page_text[:100000]  # Limit to 100k chars
        })
    
    if not vendor_pages:
        return []
    
    # Create evaluation prompt with scraped content
    evaluation_prompt = f"""ROLE: Procurement Specialist
TASK: Evaluate vendor information for {product_name} procurement.
Budget: ${budget_usd:,.2f} per unit × {quantity} units = ${budget_usd * quantity:,.2f} total

VENDOR PAGES TO EVALUATE:
{json.dumps([{k: v for k, v in vp.items() if k != 'page_text'} for vp in vendor_pages], indent=2)}

For EACH vendor, extract the following information from the scraped page content:
1. **Contact Information**: sales email, phone, physical address, contact URL
2. **Product Details**: exact model name, SKU if available, specifications
3. **Pricing**: current unit price, volume pricing if available, total cost
4. **Availability**: in-stock status, lead time in days, backorder status
5. **Delivery**: shipping to Wichita, KS, delivery time, shipping terms
6. **Business Info**: company name (if different), tax ID if visible, return policy
7. **Compliance**: NDAA, TAA, Buy American, or other certifications mentioned
8. **Quality Indicators**: OEM vs distributor, warranty terms, support offered

Rules:
- Use ONLY information visible on the linked pages
- Extract sales email and phone from Contact/About pages if not on product page
- Infer lead time from shipping policy or product availability
- Mark as "unknown" if information is not available on the pages
- Be conservative with estimates

Return JSON format:
{{
  "evaluated_vendors": [
    {{
      "vendor_id": "vendor_1",
      "vendor_name": "Company Name",
      "product_model": "Exact product model from page",
      "contact": {{
        "sales_email": "sales@company.com",
        "sales_phone": "(555) 123-4567",
        "contact_url": "https://...",
        "physical_address": "Street, City, State ZIP"
      }},
      "pricing": {{
        "unit_price": 1250.00,
        "total_cost": 2500.00,
        "volume_pricing": "Contact for quotes on 10+ units",
        "currency": "USD",
        "notes": "Plus shipping and handling"
      }},
      "availability": {{
        "in_stock": true,
        "lead_time_days": 5,
        "backorder_days": null,
        "notes": "Ships from warehouse in 2-3 business days"
      }},
      "delivery": {{
        "ships_to_wichita": true,
        "delivery_days": 7,
        "shipping_method": "Ground shipping included",
        "terms": "FOB Destination"
      }},
      "business_info": {{
        "company_name": "Official Company Name Inc.",
        "tax_id_visible": false,
        "return_policy": "30-day return policy",
        "warranty": "1 year manufacturer warranty"
      }},
      "compliance": ["NDAA compliant", "Made in USA"],
      "quality_indicators": {{
        "is_oem": false,
        "is_distributor": true,
        "is_authorized": true,
        "support": "Phone and email support available"
      }},
      "evaluation_notes": "Authorized distributor with competitive pricing and fast shipping"
    }}
  ]
}}
"""
    
    try:
        logger.info(f"Evaluating {len(vendor_pages)} vendors with LLM...")
        
        # Build messages with scraped content
        messages = [
            {"role": "system", "content": "You are an expert procurement specialist evaluating vendor information from web pages. Extract factual information only."},
            {"role": "user", "content": evaluation_prompt}
        ]
        
        # Add scraped page content to the messages
        for vp in vendor_pages:
            if vp.get('page_text'):
                messages.append({
                    "role": "user", 
                    "content": f"\n\n--- PAGE CONTENT FOR {vp['name']} ({vp['url']}) ---\n{vp['page_text']}"
                })
        
        resp = client.chat.completions.create(
            model="gpt-4o",
            temperature=0.1,
            max_tokens=4000,
            response_format={"type": "json_object"},
            messages=messages,
            timeout=120  # Increased timeout for scraped content
        )
        
        content = resp.choices[0].message.content or "{}"
        result = json.loads(content)
        
        evaluated = result.get("evaluated_vendors", [])
        logger.info(f"Successfully evaluated {len(evaluated)} vendors")
        
        return evaluated
        
    except Exception as e:
        logger.error(f"Error evaluating vendors with LLM: {e}")
        # Return basic vendor info if LLM evaluation fails
        return [
            {
                "vendor_id": vp.get('id', f'vendor_{i+1}'),
                "vendor_name": vp.get('vendor_name') or vp.get('name', 'Unknown'),
                "contact": {"sales_email": "Contact via website"},
                "pricing": {"unit_price": vp.get('existing_price', 0), "currency": "USD"},
                "availability": {"lead_time_days": 30},
                "evaluation_notes": "Basic evaluation - detailed extraction failed"
            }
            for i, vp in enumerate(vendor_pages)
        ]


def format_vendor_evaluation_description(evaluated_vendors: List[Dict[str, Any]]) -> str:
    """
    Format vendor evaluation into a natural language description for procurement document.
    
    Args:
        evaluated_vendors: List of evaluated vendor data
        
    Returns:
        Formatted text description
    """
    
    if not evaluated_vendors:
        return "No vendors evaluated yet."
    
    lines = []
    lines.append("We have evaluated the following vendors for this procurement:\n")
    
    for i, vendor in enumerate(evaluated_vendors, 1):
        name = vendor.get('vendor_name', 'Unknown Vendor')
        contact = vendor.get('contact', {})
        pricing = vendor.get('pricing', {})
        availability = vendor.get('availability', {})
        
        lines.append(f"{i}. {name}")
        
        # Contact info - only show if not 'unknown' and add URL
        email = contact.get('sales_email', '').strip()
        phone = contact.get('sales_phone', '').strip()
        address = contact.get('physical_address', '').strip()
        contact_url = contact.get('contact_url', '').strip()
        
        # Only show contact fields that have actual data (not 'unknown' or empty)
        if email and email.lower() != 'unknown':
            lines.append(f"   Contact: {email}")
        if phone and phone.lower() != 'unknown':
            lines.append(f"   Phone: {phone}")
        if address and address.lower() != 'unknown':
            lines.append(f"   Address: {address}")
        
        # Add URL if available
        if contact_url and contact_url.lower() not in ['unknown', '#', '']:
            lines.append(f"   URL: {contact_url}")
        
        # Pricing
        unit_price = pricing.get('unit_price')
        if unit_price:
            try:
                price_val = float(unit_price) if isinstance(unit_price, str) else unit_price
                lines.append(f"   Estimated Price: ${price_val:,.2f} per unit")
            except (ValueError, TypeError):
                lines.append(f"   Estimated Price: {unit_price} per unit")
        
        # Availability
        if availability.get('in_stock'):
            lead_time = availability.get('lead_time_days')
            if lead_time:
                lines.append(f"   Availability: In stock, {lead_time} day lead time")
        elif availability.get('lead_time_days'):
            lines.append(f"   Availability: {availability['lead_time_days']} day lead time")
        
        # Notes
        if vendor.get('evaluation_notes'):
            lines.append(f"   Notes: {vendor['evaluation_notes']}")
        
        lines.append("")
    
    return "\n".join(lines)


def get_vendor_summary_for_procurement(vendors: List[Dict[str, Any]]) -> str:
    """
    Generate a vendor evaluation summary for the procurement document.
    
    Args:
        vendors: List of vendor evaluation data
        
    Returns:
        Formatted summary text
    """
    
    if not vendors:
        return "Vendor evaluation in progress."
    
    total_vendors = len(vendors)
    in_stock = sum(1 for v in vendors if v.get('availability', {}).get('in_stock', False))
    # Handle both int and string lead times
    lead_times = []
    for v in vendors:
        lt = v.get('availability', {}).get('lead_time_days', 30)
        if isinstance(lt, (int, float)):
            lead_times.append(lt)
        else:
            lead_times.append(30)  # default if not numeric
    avg_lead_time = sum(lead_times) / total_vendors if lead_times else 30
    
    summary = f"""
VENDOR EVALUATION SUMMARY:

Total Vendors Evaluated: {total_vendors}
Vendors In Stock: {in_stock}
Average Lead Time: {avg_lead_time:.0f} days

"""
    
    summary += "DETAILED EVALUATIONS:\n\n"
    summary += format_vendor_evaluation_description(vendors)
    
    return summary


def generate_rfq_draft(
    evaluated_vendors: List[Dict[str, Any]],
    product_name: str,
    quantity: int,
    client: OpenAI
) -> str:
    """
    Generate an RFQ draft email for vendors with missing prices.
    
    Args:
        evaluated_vendors: List of vendor evaluation results
        product_name: Product being procured
        quantity: Quantity needed
        client: OpenAI client
        
    Returns:
        RFQ draft text
    """
    try:
        # Filter to only vendors with missing prices
        vendors_needing_rfq = [
            v for v in evaluated_vendors 
            if not v.get('pricing', {}).get('unit_price')
        ]
        
        if not vendors_needing_rfq:
            return "All vendors have pricing information. RFQ not required."
        
        # Prepare vendor summary for LLM
        vendor_items = []
        for v in vendors_needing_rfq:
            name = v.get('vendor_name', 'Unknown')
            contact = v.get('contact', {})
            model = v.get('product_model', 'N/A')
            availability = v.get('availability', {})
            moq = availability.get('moq') or 'Not specified'
            lead_time = availability.get('lead_time_days') or 'TBD'
            
            vendor_items.append({
                "vendor": name,
                "contact_email": contact.get('sales_email', 'Contact via website'),
                "contact_phone": contact.get('sales_phone', 'TBD'),
                "product_model": model,
                "moq": moq,
                "lead_time_days": lead_time
            })
        
        prompt = f"""Draft a professional, concise RFQ (Request for Quotation) email for the following procurement:

Product: {product_name}
Quantity: {quantity} units

Vendors to contact:
{json.dumps(vendor_items, indent=2)}

Requirements for each vendor:
- Unit price and total cost
- Currency (USD preferred)
- Lead time in days
- Minimum order quantity (MOQ)
- Availability/stock status
- Shipping terms and delivery timeline to Wichita, KS
- Pricing validity period (e.g., 30 days)
- Payment terms

Keep the tone professional but friendly. End with a request for response by end of week and contact information for questions.
Keep under 250 words."""

        logger.info(f"Generating RFQ draft for {len(vendor_items)} vendors...")
        
        resp = client.chat.completions.create(
            model="gpt-4o",
            temperature=0.3,
            max_tokens=500,
            messages=[
                {"role": "system", "content": "You are a procurement specialist drafting professional RFQ emails."},
                {"role": "user", "content": prompt}
            ],
            timeout=30
        )
        
        draft = resp.choices[0].message.content or "RFQ draft generation failed."
        logger.info("RFQ draft generated successfully")
        return draft
        
    except Exception as e:
        logger.error(f"Error generating RFQ draft: {e}")
        return f"Error generating RFQ draft: {str(e)}"


def generate_procurement_letter_draft(
    evaluated_vendors: List[Dict[str, Any]],
    product_name: str,
    quantity: int,
    client: OpenAI
) -> str:
    """
    Generate a procurement letter draft when all data is complete.
    
    Args:
        evaluated_vendors: List of vendor evaluation results with complete data
        product_name: Product being procured
        quantity: Quantity needed
        client: OpenAI client
        
    Returns:
        Procurement letter draft text
    """
    try:
        # Prepare vendor summary with complete data
        vendor_items = []
        for v in evaluated_vendors:
            name = v.get('vendor_name', 'Unknown')
            pricing = v.get('pricing', {})
            contact = v.get('contact', {})
            availability = v.get('availability', {})
            
            vendor_items.append({
                "vendor": name,
                "model": v.get('product_model', 'N/A'),
                "unit_price": pricing.get('unit_price', 0),
                "currency": pricing.get('currency', 'USD'),
                "total_cost": pricing.get('total_cost', 0),
                "lead_time_days": availability.get('lead_time_days', 30),
                "contact": contact.get('sales_email', 'TBD')
            })
        
        prompt = f"""Draft a concise procurement intent confirmation letter for the following:

Product: {product_name}
Quantity: {quantity} units

Evaluated Vendors (complete pricing available):
{json.dumps(vendor_items, indent=2)}

The letter should:
- Confirm we have complete vendor information (pricing, lead time, contact)
- Summarize key decision factors
- State readiness to proceed with purchase order pending internal approval
- Request final documentation and order confirmation

Keep professional and under 200 words."""

        logger.info(f"Generating procurement letter draft for {len(vendor_items)} vendors...")
        
        resp = client.chat.completions.create(
            model="gpt-4o",
            temperature=0.3,
            max_tokens=400,
            messages=[
                {"role": "system", "content": "You are a procurement specialist drafting professional procurement letters."},
                {"role": "user", "content": prompt}
            ],
            timeout=30
        )
        
        draft = resp.choices[0].message.content or "Procurement letter draft generation failed."
        logger.info("Procurement letter draft generated successfully")
        return draft
        
    except Exception as e:
        logger.error(f"Error generating procurement letter draft: {e}")
        return f"Error generating procurement letter draft: {str(e)}"


def get_complete_vendor_analysis(
    evaluated_vendors: List[Dict[str, Any]],
    product_name: str,
    quantity: int,
    client: OpenAI
) -> Dict[str, Any]:
    """
    Perform complete vendor analysis including validation and document generation.
    Filters out incomplete vendors and only processes complete ones.
    
    Args:
        evaluated_vendors: List of vendor evaluation results
        product_name: Product being procured
        quantity: Quantity needed
        client: OpenAI client
        
    Returns:
        Complete analysis with validation, recommendations, and document drafts
    """
    # Separate complete vs incomplete vendors
    complete_vendors = []
    incomplete_vendors = []
    
    for vendor in evaluated_vendors:
        pricing = vendor.get('pricing', {})
        contact = vendor.get('contact', {})
        availability = vendor.get('availability', {})
        
        # Check if vendor is complete
        has_price = pricing.get('unit_price') is not None and pricing.get('unit_price', 0) > 0
        has_contact = bool(contact.get('sales_email') or contact.get('sales_phone'))
        has_lead_time = availability.get('lead_time_days') is not None
        
        is_complete = has_price and has_contact and has_lead_time
        
        if is_complete:
            complete_vendors.append(vendor)
        else:
            incomplete_vendors.append(vendor)
    
    # Analyze complete vendors only
    analysis = analyze_missing_data(complete_vendors) if complete_vendors else {
        'needs_rfq': True,
        'missing_price_vendors': ['All vendors'],
        'present_summary': [],
        'missing_summary': [],
        'recommendation': 'No complete vendors found',
        'bot_check': {'block_next_step': True, 'block_reason': 'No complete vendor data'}
    }
    
    # If we have complete vendors, proceed with procurement
    # If all are incomplete, generate RFQ
    if complete_vendors and not analysis['needs_rfq']:
        # All complete vendors are ready - proceed to procurement
        return {
            "status": "ready",
            "complete_vendors": len(complete_vendors),
            "incomplete_vendors": len(incomplete_vendors),
            "present": analysis['present_summary'],
            "missing": analysis['missing_summary'],
            "recommendation": f"{len(complete_vendors)} vendor(s) have complete information. Ready to proceed with procurement.",
            "bot_check": {
                "block_next_step": False,
                "block_reason": None
            },
            "documents": {}  # No letter needed - just proceed to procurement
        }
    elif complete_vendors:
        # Some complete, some incomplete - generate RFQ for incomplete ones
        draft = generate_rfq_draft(incomplete_vendors, product_name, quantity, client)
        return {
            "status": "partial",
            "complete_vendors": len(complete_vendors),
            "incomplete_vendors": len(incomplete_vendors),
            "present": analysis['present_summary'],
            "missing": analysis['missing_summary'],
            "recommendation": f"{len(complete_vendors)} vendor(s) are ready for procurement. RFQ needed for {len(incomplete_vendors)} vendor(s).",
            "bot_check": {
                "block_next_step": True,
                "block_reason": f"Incomplete data for {len(incomplete_vendors)} vendor(s)"
            },
            "documents": {
                "rfq_draft": draft
            }
        }
    else:
        # All incomplete - need RFQ for all
        draft = generate_rfq_draft(evaluated_vendors, product_name, quantity, client)
        return {
            "status": "needs_rfq",
            "complete_vendors": 0,
            "incomplete_vendors": len(evaluated_vendors),
            "present": analysis['present_summary'],
            "missing": analysis['missing_summary'],
            "recommendation": "All vendors need RFQ. Missing critical information.",
            "bot_check": {
                "block_next_step": True,
                "block_reason": "Missing prices for all vendors"
            },
            "documents": {
                "rfq_draft": draft
            }
        }


