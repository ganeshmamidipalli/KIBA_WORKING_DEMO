#!/usr/bin/env node

/**
 * API Test Script
 * Tests API functionality and checks for quotas/rate limits
 */

const API_BASE = process.env.VITE_API_BASE || 'http://localhost:8000';

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function testHealth() {
  log('\n🔍 Testing Health Endpoint...', 'cyan');
  try {
    const response = await fetch(`${API_BASE}/health`);
    const data = await response.json();
    
    if (response.ok) {
      log('✅ Health check passed!', 'green');
      log(`   Status: ${data.status}`, 'green');
      log(`   OpenAI Configured: ${data.openai_configured ? 'Yes' : 'No'}`, 
          data.openai_configured ? 'green' : 'yellow');
      log(`   OpenAI Connected: ${data.openai_connected ? 'Yes' : 'No'}`, 
          data.openai_connected ? 'green' : 'yellow');
      log(`   Timestamp: ${data.timestamp}`);
      return true;
    } else {
      log('❌ Health check failed!', 'red');
      log(`   Status: ${response.status} ${response.statusText}`, 'red');
      return false;
    }
  } catch (error) {
    log('❌ Health check error:', 'red');
    log(`   ${error.message}`, 'red');
    return false;
  }
}

async function testTokenUsage() {
  log('\n💰 Checking Token Usage & Quotas...', 'cyan');
  try {
    const response = await fetch(`${API_BASE}/api/token_usage`);
    const data = await response.json();
    
    if (response.ok) {
      log('✅ Token usage endpoint accessible', 'green');
      log(`   Total Tokens Used: ${data.total_tokens?.toLocaleString() || 0}`, 'blue');
      log(`   Total Cost (USD): $${data.total_cost_usd?.toFixed(4) || '0.0000'}`, 'blue');
      
      if (data.by_endpoint && Object.keys(data.by_endpoint).length > 0) {
        log('\n   Usage by Endpoint:', 'blue');
        for (const [endpoint, stats] of Object.entries(data.by_endpoint)) {
          log(`   - ${endpoint}:`, 'blue');
          log(`     • Calls: ${stats.calls || 0}`, 'blue');
          log(`     • Tokens: ${(stats.total_tokens || 0).toLocaleString()}`, 'blue');
        }
      } else {
        log('   No endpoint usage data available yet', 'yellow');
      }
      return true;
    } else {
      log('❌ Token usage check failed!', 'red');
      return false;
    }
  } catch (error) {
    log('❌ Token usage error:', 'red');
    log(`   ${error.message}`, 'red');
    return false;
  }
}

async function testRecommendationsAPI() {
  log('\n🧪 Testing Recommendations API with Example...', 'cyan');
  
  const testPayload = {
    project_context: {
      project_name: "Test Project",
      procurement_type: "Purchase Order",
      service_program: "Applied Research",
      technical_poc: "Test User"
    },
    product_details: {
      product_name: "Laptop",
      budget_total: 1500,
      quantity: 1,
      preferred_vendors: ["Dell", "HP"],
      description: "A reliable laptop for development work"
    },
    combined_scope: "Need a laptop with at least 16GB RAM, 512GB SSD, Intel i7 or equivalent processor",
    uploaded_summaries: []
  };
  
  try {
    log('   Sending test request...', 'blue');
    const startTime = Date.now();
    const response = await fetch(`${API_BASE}/api/generate_recommendations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testPayload)
    });
    
    const duration = Date.now() - startTime;
    const data = await response.json();
    
    if (response.ok) {
      log('✅ Recommendations API working!', 'green');
      log(`   Response time: ${duration}ms`, 'green');
      
      if (data.variants && Array.isArray(data.variants)) {
        log(`   Generated ${data.variants.length} variant(s)`, 'green');
        if (data.variants.length > 0) {
          log(`   First variant: ${data.variants[0].title}`, 'blue');
          log(`   Price: $${data.variants[0].est_unit_price_usd?.toLocaleString() || 'N/A'}`, 'blue');
        }
      }
      
      if (data.ai_recommendation) {
        log('   AI Recommendation available', 'green');
      }
      
      return true;
    } else {
      log('❌ Recommendations API failed!', 'red');
      log(`   Status: ${response.status} ${response.statusText}`, 'red');
      log(`   Error: ${JSON.stringify(data, null, 2)}`, 'red');
      
      // Check for rate limit errors
      if (response.status === 429 || data.error?.includes('rate limit')) {
        log('\n⚠️  RATE LIMIT DETECTED!', 'yellow');
        log('   The API is being rate-limited. Please wait before retrying.', 'yellow');
        return false;
      }
      
      return false;
    }
  } catch (error) {
    log('❌ Recommendations API error:', 'red');
    log(`   ${error.message}`, 'red');
    
    if (error.message.includes('fetch')) {
      log('\n⚠️  CONNECTION ERROR', 'yellow');
      log('   Make sure the backend server is running on ' + API_BASE, 'yellow');
    }
    
    return false;
  }
}

async function testRateLimits() {
  log('\n⚡ Testing Rate Limits...', 'cyan');
  log('   Sending 5 rapid requests to check rate limiting...', 'blue');
  
  const requests = [];
  const startTime = Date.now();
  
  for (let i = 0; i < 5; i++) {
    requests.push(
      fetch(`${API_BASE}/health`)
        .then(res => ({ status: res.status, ok: res.ok, index: i + 1 }))
        .catch(err => ({ error: err.message, index: i + 1 }))
    );
  }
  
  try {
    const results = await Promise.all(requests);
    const duration = Date.now() - startTime;
    
    let successCount = 0;
    let rateLimitCount = 0;
    let errorCount = 0;
    
    results.forEach(result => {
      if (result.error) {
        errorCount++;
        log(`   Request ${result.index}: ❌ Error - ${result.error}`, 'red');
      } else if (result.status === 429) {
        rateLimitCount++;
        log(`   Request ${result.index}: ⚠️  Rate Limited (429)`, 'yellow');
      } else if (result.ok) {
        successCount++;
        log(`   Request ${result.index}: ✅ Success (${result.status})`, 'green');
      } else {
        errorCount++;
        log(`   Request ${result.index}: ❌ Failed (${result.status})`, 'red');
      }
    });
    
    log(`\n   Results:`, 'blue');
    log(`   • Total time: ${duration}ms`, 'blue');
    log(`   • Successful: ${successCount}/5`, successCount === 5 ? 'green' : 'yellow');
    log(`   • Rate Limited: ${rateLimitCount}/5`, rateLimitCount === 0 ? 'green' : 'yellow');
    log(`   • Errors: ${errorCount}/5`, errorCount === 0 ? 'green' : 'yellow');
    
    if (rateLimitCount > 0) {
      log('\n⚠️  RATE LIMITING DETECTED', 'yellow');
      log('   The API appears to have rate limiting enabled.', 'yellow');
      log('   Some requests were throttled with HTTP 429 status.', 'yellow');
    } else {
      log('\n✅ No rate limiting detected on health endpoint', 'green');
    }
    
    return rateLimitCount === 0;
  } catch (error) {
    log('❌ Rate limit test error:', 'red');
    log(`   ${error.message}`, 'red');
    return false;
  }
}

async function testIntakeAPI() {
  log('\n🧪 Testing KPA Intake API with Example...', 'cyan');
  
  const testPayload = {
    product_name: "Development Laptop",
    budget_usd: 2000,
    quantity: 2,
    scope_text: "High-performance laptop for software development",
    vendors: ["Dell", "Lenovo"]
  };
  
  try {
    log('   Sending test request...', 'blue');
    const startTime = Date.now();
    const response = await fetch(`${API_BASE}/api/intake_recommendations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testPayload)
    });
    
    const duration = Date.now() - startTime;
    
    if (response.ok) {
      const data = await response.json();
      log('✅ Intake API working!', 'green');
      log(`   Response time: ${duration}ms`, 'green');
      log(`   Session ID: ${data.session_id || 'N/A'}`, 'blue');
      
      if (data.intake) {
        log(`   Status: ${data.intake.status}`, 'blue');
        if (data.intake.missing_info_questions && data.intake.missing_info_questions.length > 0) {
          log(`   Follow-up Questions: ${data.intake.missing_info_questions.length}`, 'blue');
        } else {
          log('   No follow-up questions needed', 'green');
        }
      }
      
      return true;
    } else {
      const errorText = await response.text();
      log('❌ Intake API failed!', 'red');
      log(`   Status: ${response.status} ${response.statusText}`, 'red');
      log(`   Error: ${errorText}`, 'red');
      
      if (response.status === 429) {
        log('\n⚠️  RATE LIMIT DETECTED!', 'yellow');
        return false;
      }
      
      return false;
    }
  } catch (error) {
    log('❌ Intake API error:', 'red');
    log(`   ${error.message}`, 'red');
    return false;
  }
}

async function main() {
  log('\n' + '='.repeat(60), 'bold');
  log('KIBA3 API Test Suite', 'bold');
  log('='.repeat(60), 'bold');
  log(`\nTesting API at: ${API_BASE}\n`, 'blue');
  
  const results = {
    health: false,
    tokenUsage: false,
    recommendations: false,
    rateLimits: false,
    intake: false
  };
  
  // Run tests
  results.health = await testHealth();
  
  if (!results.health) {
    log('\n❌ API server is not responding. Please check:', 'red');
    log('   1. Is the backend server running?', 'yellow');
    log(`   2. Is it accessible at ${API_BASE}?`, 'yellow');
    log('   3. Check backend logs for errors', 'yellow');
    process.exit(1);
  }
  
  results.tokenUsage = await testTokenUsage();
  results.recommendations = await testRecommendationsAPI();
  results.rateLimits = await testRateLimits();
  results.intake = await testIntakeAPI();
  
  // Summary
  log('\n' + '='.repeat(60), 'bold');
  log('Test Summary', 'bold');
  log('='.repeat(60), 'bold');
  
  const totalTests = Object.keys(results).length;
  const passedTests = Object.values(results).filter(r => r).length;
  
  log(`\n✅ Health Check:        ${results.health ? 'PASS' : 'FAIL'}`, 
      results.health ? 'green' : 'red');
  log(`✅ Token Usage:         ${results.tokenUsage ? 'PASS' : 'FAIL'}`, 
      results.tokenUsage ? 'green' : 'red');
  log(`✅ Recommendations API: ${results.recommendations ? 'PASS' : 'FAIL'}`, 
      results.recommendations ? 'green' : 'red');
  log(`✅ Rate Limit Check:    ${results.rateLimits ? 'PASS' : 'FAIL'}`, 
      results.rateLimits ? 'green' : 'red');
  log(`✅ Intake API:          ${results.intake ? 'PASS' : 'FAIL'}`, 
      results.intake ? 'green' : 'red');
  
  log(`\n📊 Overall: ${passedTests}/${totalTests} tests passed`, 
      passedTests === totalTests ? 'green' : 'yellow');
  
  if (passedTests === totalTests) {
    log('\n🎉 All tests passed! The API is working correctly.', 'green');
  } else {
    log('\n⚠️  Some tests failed. Please review the errors above.', 'yellow');
  }
  
  log('\n' + '='.repeat(60) + '\n', 'bold');
}

// Run the tests
main().catch(error => {
  log('\n❌ Fatal error:', 'red');
  log(error.message, 'red');
  process.exit(1);
});





