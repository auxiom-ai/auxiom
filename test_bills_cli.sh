#!/bin/bash

# End-to-end testing script for get_bills function using Lambda Function URL
# Uses curl to send HTTP requests directly to the Lambda function

set -e

# Configuration
LAMBDA_FUNCTION_URL="https://qsg5jaaxov4gxpkn4uyrnsiho40ocjbo.lambda-url.us-east-1.on.aws/"

echo "🧪 Testing get_bills function end-to-end"
echo "========================================"
echo "🔗 Using Lambda Function URL: $LAMBDA_FUNCTION_URL"
echo ""

# Function to send request to Lambda
send_lambda_request() {
    local action=$1
    local payload=$2
    local description=$3
    
    echo "📋 Testing: $description"
    echo "   Action: $action"
    echo "   Payload: $payload"
    
    response=$(curl -s -w "\nHTTP_STATUS:%{http_code}" \
        -X POST \
        -H "Content-Type: application/json" \
        -d "{\"action\": \"$action\", \"payload\": $payload}" \
        "$LAMBDA_FUNCTION_URL")
    
    # Extract HTTP status code
    http_status=$(echo "$response" | grep "HTTP_STATUS:" | cut -d: -f2)
    response_body=$(echo "$response" | sed '/HTTP_STATUS:/d')
    
    echo "   Status Code: $http_status"
    
    if [ "$http_status" = "200" ]; then
        echo "   ✅ Request successful"
        echo "   Response preview: $(echo "$response_body" | head -c 200)..."
        echo ""
        return 0
    else
        echo "   ❌ Request failed"
        echo "   Error: $response_body"
        echo ""
        return 1
    fi
}

# Test 1: Congress Bills Scraper (get_bills function)
echo "🔍 Step 1: Testing Congress Bills Scraper (get_bills function)..."
send_lambda_request "e_congress" '{"topics": ["climate change", "renewable energy", "infrastructure", "healthcare"]}' "Congress Bills Scraper"

# Test 2: News Scraper
echo "📰 Step 2: Testing News Scraper..."
send_lambda_request "e_news" '{"topics": ["technology", "AI", "innovation"]}' "News Scraper"

# Test 3: Government Documents Scraper
echo "🏛️ Step 3: Testing Government Documents Scraper..."
send_lambda_request "e_gov" '{"topics": ["regulation", "policy", "compliance"]}' "Government Documents Scraper"

# Test 4: Dispatch Action (triggers multiple scrapers)
echo "🚀 Step 4: Testing Dispatch Action..."
send_lambda_request "e_dispatch" '{}' "Dispatch Action"

# Test 5: Merge Action
echo "🔗 Step 5: Testing Merge Action..."
send_lambda_request "e_merge" '{}' "Merge Action"

# Test 6: Clean Action
echo "🧹 Step 6: Testing Clean Action..."
send_lambda_request "e_clean" '{}' "Clean Action"

echo ""
echo "🏁 All Lambda Function URL tests completed!"
echo ""
echo "📊 Summary:"
echo "   ✅ Tested get_bills function via e_congress action"
echo "   ✅ Tested other scraper functions (e_news, e_gov)"
echo "   ✅ Tested orchestration functions (e_dispatch, e_merge, e_clean)"
echo ""
echo "📝 Notes:"
echo "   - The Lambda function URL only provides access to the scraper lambda"
echo "   - Clusterer, Content, and Cron lambdas would need separate URLs or SQS integration"
echo "   - In production, the scraper automatically triggers downstream processes via SQS"
echo ""
echo "🔍 To monitor execution:"
echo "   - Check CloudWatch logs for the scraper lambda function"
echo "   - Monitor S3 buckets for scraped data"
echo "   - Watch SQS queues for downstream processing triggers"

# Optional: Test with different topics for get_bills
echo ""
echo "🎯 Additional get_bills tests with specific topics:"
echo ""

echo "Testing get_bills with education topics..."
send_lambda_request "e_congress" '{"topics": ["education funding", "student loans", "school choice"]}' "Education Bills"

echo "Testing get_bills with healthcare topics..."
send_lambda_request "e_congress" '{"topics": ["healthcare reform", "medicare", "prescription drugs"]}' "Healthcare Bills"

echo "Testing get_bills with infrastructure topics..."
send_lambda_request "e_congress" '{"topics": ["infrastructure investment", "transportation", "broadband"]}' "Infrastructure Bills"

echo ""
echo "🎉 Comprehensive get_bills testing completed!"
