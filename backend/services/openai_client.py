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
        # For testing purposes, return None if no API key
        if os.environ.get("TESTING_MODE") == "true":
            return None
        raise RuntimeError("OPENAI_API_KEY environment variable is required")
    return OpenAI(api_key=key)

# Global client instance
client = get_client()
