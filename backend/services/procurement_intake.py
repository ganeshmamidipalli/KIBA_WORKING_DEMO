"""
Procurement intake service for KPA One-Flow.
Handles initial requirement gathering and follow-up question generation.
"""

import json
import logging
from typing import Dict, Any
from services.openai_client import client
from services.schema_definitions import INTAKE_SCHEMA
from services.prompt_templates import SYSTEM_PROMPT, intake_prompt

logger = logging.getLogger(__name__)

def run_intake(product_name: str, budget: float, quantity: int, scope_text: str) -> Dict[str, Any]:
    """
    Run intake process to generate follow-up questions.
    
    Args:
        product_name: Name of the product/service
        budget: Budget in USD
        quantity: Quantity needed
        scope_text: Project scope and requirements
        
    Returns:
        Dict with intake results including questions and summary
    """
    try:
        # Check if client is available (for testing)
        if client is None:
            logger.info("OpenAI client not available, using fallback intake")
            return {
                "status": "questions",
                "requirements_summary": f"Requirements for {product_name} (${budget} budget, qty: {quantity})",
                "missing_info_questions": [
                    f"What specific tasks will {product_name} be used for?",
                    "What are your performance requirements?",
                    "Do you have any compliance requirements?",
                    "What is your preferred delivery timeline?"
                ]
            }
        
        input_text = intake_prompt(product_name, budget, quantity, scope_text)
        
        # Use OpenAI responses API with structured output
        resp = client.chat.completions.create(
            model="gpt-4o-mini",
            temperature=0,
            max_tokens=1000,
            response_format={
                "type": "json_schema",
                "json_schema": {
                    "name": INTAKE_SCHEMA["name"],
                    "schema": INTAKE_SCHEMA["schema"],
                    "strict": INTAKE_SCHEMA["strict"]
                }
            },
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": input_text}
            ]
        )
        
        # Parse response
        content = resp.choices[0].message.content
        if not content:
            raise ValueError("Empty response from OpenAI")
            
        try:
            result = json.loads(content)
        except json.JSONDecodeError as e:
            logger.error(f"JSON parse error in intake: {e}")
            logger.error(f"Content: {content[:500]}")
            raise ValueError(f"Invalid JSON response: {e}")
        
        # Validate required fields
        if "status" not in result or "requirements_summary" not in result:
            raise ValueError("Missing required fields in intake response")
            
        logger.info(f"Intake completed: {len(result.get('missing_info_questions', []))} questions generated")
        return result
        
    except Exception as e:
        logger.error(f"Error in run_intake: {e}")
        # Return fallback response with some default questions
        return {
            "status": "questions",
            "requirements_summary": f"Requirements for {product_name} (${budget:,} budget, qty: {quantity})",
            "missing_info_questions": [
                f"What specific tasks will {product_name} be used for?",
                "What are your performance requirements?",
                "Do you have any compliance or security requirements?",
                "What is your preferred delivery timeline?",
                "Do you need any special features or capabilities?"
            ]
        }
