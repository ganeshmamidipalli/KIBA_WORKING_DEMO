"""
OpenAI client configuration for KPA One-Flow services.
"""
import os
from openai import OpenAI
from dotenv import load_dotenv

# Load environment variables from .env.local file (fallback to .env)
load_dotenv('.env.local')
load_dotenv('.env')  # Fallback

def get_client():
    """Get configured OpenAI client."""
    key = os.environ.get("OPENAI_API_KEY")
    if not key:
        # In local/dev environments, gracefully degrade to None (services use fallbacks)
        # Set TESTING_MODE=true to silence logs in CI.
        return None
    return OpenAI(api_key=key)

# Global client instance
client = get_client()
