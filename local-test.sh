#!/bin/bash

# Check if SAM CLI is installed
if ! command -v sam &> /dev/null; then
    echo "SAM CLI is not installed. Please install it first."
    exit 1
fi

# Build the SAM application
echo "Building SAM application..."
sam build

# Function to test with a specific event
test_with_event() {
    local event_file=$1
    echo "Testing service tier function with ${event_file}..."
    sam local invoke ServiceTierFunction \
        -e "events/${event_file}" \
        -n env.json \
        --profile default
}

# Test with different events
if [ "$1" ]; then
    # If an argument is provided, use that specific event file
    test_with_event "$1"
else
    # Otherwise test with all available events
    echo "Testing with user topics event..."
    test_with_event "user_topics_event.json"
    
    echo "Testing with pulse event..."
    test_with_event "pulse_event.json"
fi

# Start local Lambda environment with environment variables
echo "Starting local Lambda environment..."
sam local start-lambda \
    -n env.json \
    --profile default 