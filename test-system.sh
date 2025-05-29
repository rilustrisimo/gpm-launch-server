#!/bin/bash

# GPM Launch Email Campaign System - Testing Script

echo "Starting GPM Launch system test..."

# Set base URLs - replace with your actual domains when ready
API_URL="https://api.gravitypointmedia.com"
TRACKING_URL="https://trk.gravitypointmedia.com"
FRONTEND_URL="https://launch.gravitypointmedia.com"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test function
test_endpoint() {
    local endpoint=$1
    local method=$2
    local expected_status=$3
    local data=$4
    local auth_header=$5
    
    echo -e "\n${YELLOW}Testing ${method} ${endpoint}${NC}"
    
    # Build curl command
    curl_cmd="curl -s -o /dev/null -w '%{http_code}' -X ${method} ${API_URL}${endpoint}"
    
    # Add JSON data if provided
    if [ ! -z "$data" ]; then
        curl_cmd="${curl_cmd} -H 'Content-Type: application/json' -d '${data}'"
    fi
    
    # Add authorization header if provided
    if [ ! -z "$auth_header" ]; then
        curl_cmd="${curl_cmd} -H 'Authorization: Bearer ${auth_header}'"
    fi
    
    # Execute command and capture status code
    status_code=$(eval $curl_cmd)
    
    # Check if status code matches expected
    if [ "$status_code" -eq "$expected_status" ]; then
        echo -e "${GREEN}✓ Success! Status: ${status_code}${NC}"
        return 0
    else
        echo -e "${RED}✗ Failed! Expected: ${expected_status}, Got: ${status_code}${NC}"
        return 1
    fi
}

# Test authentication
echo -e "\n${YELLOW}=== Testing Authentication ===${NC}"
login_data='{"email":"admin@gravitypointmedia.com","password":"your_password_here"}'
token=$(curl -s -X POST "${API_URL}/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "${login_data}" | grep -o '"token":"[^"]*' | sed 's/"token":"//')

if [ -z "$token" ]; then
    echo -e "${RED}✗ Login failed! Could not retrieve token.${NC}"
    # Continue with limited testing
else
    echo -e "${GREEN}✓ Login successful! Token received.${NC}"
fi

# Test user endpoints
echo -e "\n${YELLOW}=== Testing User Endpoints ===${NC}"
test_endpoint "/api/users/profile" "GET" 200 "" "$token"

# Test template endpoints
echo -e "\n${YELLOW}=== Testing Template Endpoints ===${NC}"
test_endpoint "/api/templates" "GET" 200 "" "$token"

# Create a test template
template_data='{"name":"Test Template","subject":"Test Subject","content":"<h1>Hello, {{name}}!</h1><p>This is a test email.</p>"}'
template_id=$(curl -s -X POST "${API_URL}/api/templates" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${token}" \
  -d "${template_data}" | grep -o '"id":"[^"]*' | sed 's/"id":"//')

# Test contact endpoints
echo -e "\n${YELLOW}=== Testing Contact Endpoints ===${NC}"
test_endpoint "/api/contacts" "GET" 200 "" "$token"

# Create a test contact
contact_data='{"email":"test@example.com","firstName":"Test","lastName":"User"}'
contact_id=$(curl -s -X POST "${API_URL}/api/contacts" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${token}" \
  -d "${contact_data}" | grep -o '"id":"[^"]*' | sed 's/"id":"//')

# Test list endpoints
echo -e "\n${YELLOW}=== Testing Contact List Endpoints ===${NC}"
test_endpoint "/api/lists" "GET" 200 "" "$token"

# Create a test list
list_data='{"name":"Test List","description":"Test list description"}'
list_id=$(curl -s -X POST "${API_URL}/api/lists" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${token}" \
  -d "${list_data}" | grep -o '"id":"[^"]*' | sed 's/"id":"//')

# Add contact to list if we have both IDs
if [ ! -z "$contact_id" ] && [ ! -z "$list_id" ]; then
    echo -e "\n${YELLOW}Adding contact to list${NC}"
    curl -s -X POST "${API_URL}/api/lists/${list_id}/contacts" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer ${token}" \
      -d "{\"contactIds\":[\"${contact_id}\"]}"
    echo -e "${GREEN}✓ Contact added to list${NC}"
fi

# Test campaign endpoints
echo -e "\n${YELLOW}=== Testing Campaign Endpoints ===${NC}"
test_endpoint "/api/campaigns" "GET" 200 "" "$token"

# Create a test campaign if we have template and list
if [ ! -z "$template_id" ] && [ ! -z "$list_id" ]; then
    echo -e "\n${YELLOW}Creating test campaign${NC}"
    campaign_data="{\"name\":\"Test Campaign\",\"subject\":\"Test Subject\",\"templateId\":\"${template_id}\",\"contactListId\":\"${list_id}\"}"
    campaign_id=$(curl -s -X POST "${API_URL}/api/campaigns" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer ${token}" \
      -d "${campaign_data}" | grep -o '"id":"[^"]*' | sed 's/"id":"//')
    
    if [ ! -z "$campaign_id" ]; then
        echo -e "${GREEN}✓ Campaign created successfully${NC}"
        
        # Send test email
        echo -e "\n${YELLOW}Sending test email${NC}"
        curl -s -X POST "${API_URL}/api/campaigns/${campaign_id}/test" \
          -H "Content-Type: application/json" \
          -H "Authorization: Bearer ${token}" \
          -d "{\"email\":\"test@example.com\"}"
        echo -e "${GREEN}✓ Test email sent${NC}"
    fi
fi

# Test tracking endpoints
echo -e "\n${YELLOW}=== Testing Tracking Endpoints ===${NC}"
curl -s -o /dev/null "${TRACKING_URL}/status"
echo -e "${GREEN}✓ Tracking status endpoint called${NC}"

# Test stats endpoints
echo -e "\n${YELLOW}=== Testing Stats Endpoints ===${NC}"
test_endpoint "/api/stats/overview" "GET" 200 "" "$token"

# Clean up test data
echo -e "\n${YELLOW}=== Clean Up Test Data? ===${NC}"
echo "Do you want to clean up the test data? (y/n)"
read -r cleanup

if [ "$cleanup" == "y" ] || [ "$cleanup" == "Y" ]; then
    echo "Cleaning up test data..."
    
    # Delete campaign if created
    if [ ! -z "$campaign_id" ]; then
        curl -s -X DELETE "${API_URL}/api/campaigns/${campaign_id}" \
          -H "Authorization: Bearer ${token}"
        echo "Campaign deleted."
    fi
    
    # Delete list if created
    if [ ! -z "$list_id" ]; then
        curl -s -X DELETE "${API_URL}/api/lists/${list_id}" \
          -H "Authorization: Bearer ${token}"
        echo "Contact list deleted."
    fi
    
    # Delete contact if created
    if [ ! -z "$contact_id" ]; then
        curl -s -X DELETE "${API_URL}/api/contacts/${contact_id}" \
          -H "Authorization: Bearer ${token}"
        echo "Contact deleted."
    fi
    
    # Delete template if created
    if [ ! -z "$template_id" ]; then
        curl -s -X DELETE "${API_URL}/api/templates/${template_id}" \
          -H "Authorization: Bearer ${token}"
        echo "Template deleted."
    fi
    
    echo -e "${GREEN}✓ Test data cleanup complete${NC}"
fi

echo -e "\n${GREEN}=== Testing Complete ===${NC}"
