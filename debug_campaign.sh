#!/bin/bash

# Turtle Send Campaign Diagnostic Script
# Usage: ./debug_campaign.sh <CAMPAIGN_ID>

CAMPAIGN_ID=$1
WORKER_URL="https://worker.gravitypointmedia.com"
API_URL="https://lapi.gravitypointmedia.com"
API_KEY="14d18a0ab3ee46199da20077529788dd"

if [ -z "$CAMPAIGN_ID" ]; then
    echo "Usage: $0 <CAMPAIGN_ID>"
    echo "Example: $0 12345678-1234-1234-1234-123456789012"
    exit 1
fi

echo "🔍 Debugging Turtle Send Campaign: $CAMPAIGN_ID"
echo "================================================"

# 1. Check Worker Status
echo "1. 🐛 Checking Worker Campaign Status..."
echo "   URL: $WORKER_URL/api/campaign/$CAMPAIGN_ID/status"
WORKER_STATUS=$(curl -s "$WORKER_URL/api/campaign/$CAMPAIGN_ID/status" \
    -H "Authorization: Bearer $API_KEY" \
    -w "HTTP_STATUS:%{http_code}")

HTTP_STATUS=$(echo "$WORKER_STATUS" | grep -o "HTTP_STATUS:[0-9]*" | cut -d: -f2)
RESPONSE_BODY=$(echo "$WORKER_STATUS" | sed 's/HTTP_STATUS:[0-9]*$//')

echo "   HTTP Status: $HTTP_STATUS"
if [ "$HTTP_STATUS" = "200" ]; then
    echo "   ✅ Worker Response: $RESPONSE_BODY" | jq . 2>/dev/null || echo "   ✅ Worker Response: $RESPONSE_BODY"
else
    echo "   ❌ Worker Error: $RESPONSE_BODY"
fi
echo ""

# 2. Check Server Database Stats
echo "2. 📊 Checking Server Database Stats..."
echo "   URL: $API_URL/api/campaigns/$CAMPAIGN_ID/stats"
SERVER_STATUS=$(curl -s "$API_URL/api/campaigns/$CAMPAIGN_ID/stats" \
    -H "Authorization: Bearer $API_KEY" \
    -w "HTTP_STATUS:%{http_code}")

HTTP_STATUS_SERVER=$(echo "$SERVER_STATUS" | grep -o "HTTP_STATUS:[0-9]*" | cut -d: -f2)
RESPONSE_BODY_SERVER=$(echo "$SERVER_STATUS" | sed 's/HTTP_STATUS:[0-9]*$//')

echo "   HTTP Status: $HTTP_STATUS_SERVER"
if [ "$HTTP_STATUS_SERVER" = "200" ]; then
    echo "   ✅ Server Response: $RESPONSE_BODY_SERVER" | jq . 2>/dev/null || echo "   ✅ Server Response: $RESPONSE_BODY_SERVER"
    
    # Extract key metrics
    TOTAL_RECIPIENTS=$(echo "$RESPONSE_BODY_SERVER" | jq -r '.stats.totalRecipients // "N/A"' 2>/dev/null)
    SENT_COUNT=$(echo "$RESPONSE_BODY_SERVER" | jq -r '.stats.sent // "N/A"' 2>/dev/null)
    PROGRESS=$(echo "$RESPONSE_BODY_SERVER" | jq -r '.progress // "N/A"' 2>/dev/null)
    STATUS=$(echo "$RESPONSE_BODY_SERVER" | jq -r '.campaign.status // "N/A"' 2>/dev/null)
    
    echo "   📈 Key Metrics:"
    echo "      Total Recipients: $TOTAL_RECIPIENTS"
    echo "      Sent Count: $SENT_COUNT"
    echo "      Progress: $PROGRESS%"
    echo "      Status: $STATUS"
else
    echo "   ❌ Server Error: $RESPONSE_BODY_SERVER"
fi
echo ""

# 3. Check for Campaign Processing Issues
echo "3. 🐢 Checking Turtle Send Specific Issues..."

if [ "$HTTP_STATUS" = "200" ]; then
    # Parse worker response for turtle-specific data
    WORKER_CAMPAIGN_STATUS=$(echo "$RESPONSE_BODY" | jq -r '.status // "unknown"' 2>/dev/null || echo "unknown")
    WORKER_PROGRESS=$(echo "$RESPONSE_BODY" | jq -r '.progress // 0' 2>/dev/null || echo "0")
    WORKER_TOTAL=$(echo "$RESPONSE_BODY" | jq -r '.stats.total // 0' 2>/dev/null || echo "0")
    WORKER_SENT=$(echo "$RESPONSE_BODY" | jq -r '.stats.sent // 0' 2>/dev/null || echo "0")
    
    echo "   Worker Status: $WORKER_CAMPAIGN_STATUS"
    echo "   Worker Progress: $WORKER_PROGRESS%"
    echo "   Worker Sent: $WORKER_SENT / $WORKER_TOTAL"
    
    # Check for common issues
    if [ "$WORKER_CAMPAIGN_STATUS" = "processing" ] && [ "$PROGRESS" = "100" ]; then
        echo "   ⚠️  ISSUE: Worker thinks it's processing but server shows 100% complete"
    elif [ "$WORKER_CAMPAIGN_STATUS" = "error" ]; then
        echo "   ❌ ISSUE: Worker reports error status"
    elif [ "$WORKER_CAMPAIGN_STATUS" = "unknown" ]; then
        echo "   ❌ ISSUE: Worker has no record of this campaign"
    fi
fi
echo ""

# 4. Check Recent Worker Logs
echo "4. 📋 Recent Worker Activity..."
echo "   Run this command to see real-time logs:"
echo "   cd /Users/eyorsogood/Sites/launch.gravitypointmedia.com/server/worker && wrangler tail --format pretty"
echo ""

# 5. Diagnostic Summary
echo "5. 📋 Diagnostic Summary"
echo "======================"

if [ "$HTTP_STATUS" != "200" ] && [ "$HTTP_STATUS_SERVER" != "200" ]; then
    echo "❌ CRITICAL: Both worker and server are not responding properly"
    echo "   Next Steps:"
    echo "   1. Check network connectivity"
    echo "   2. Verify API keys are correct"
    echo "   3. Check if services are running"
elif [ "$HTTP_STATUS" != "200" ]; then
    echo "❌ WORKER ISSUE: Worker not responding for this campaign"
    echo "   Possible Causes:"
    echo "   1. Campaign was never sent to worker"
    echo "   2. Worker Durable Object was terminated"
    echo "   3. Campaign ID not found in worker storage"
    echo "   Next Steps:"
    echo "   1. Check if campaign was properly initialized in worker"
    echo "   2. Try restarting the campaign from server"
elif [ "$HTTP_STATUS_SERVER" != "200" ]; then
    echo "❌ SERVER ISSUE: Server database not responding"
    echo "   Next Steps:"
    echo "   1. Check server logs"
    echo "   2. Verify database connectivity"
else
    echo "✅ COMMUNICATION: Both worker and server are responding"
    
    # Compare progress between worker and server
    if [ "$WORKER_SENT" != "$SENT_COUNT" ]; then
        echo "⚠️  SYNC ISSUE: Worker and server have different sent counts"
        echo "   Worker Sent: $WORKER_SENT"
        echo "   Server Sent: $SENT_COUNT"
        echo "   Difference: $((WORKER_SENT - SENT_COUNT))"
        
        if [ "$WORKER_SENT" -gt "$SENT_COUNT" ]; then
            echo "   🔍 Analysis: Worker sent more emails than server recorded"
            echo "   Possible Causes:"
            echo "   1. Server database updates are failing"
            echo "   2. Network issues between worker and server"
            echo "   3. Race conditions in status updates"
        else
            echo "   🔍 Analysis: Server has more records than worker"
            echo "   Possible Causes:"
            echo "   1. Worker was restarted/reset"
            echo "   2. Campaign was processed via local turtle service"
        fi
    else
        echo "✅ SYNC: Worker and server counts match ($SENT_COUNT sent)"
    fi
    
    # Check completion status
    if [ "$PROGRESS" = "100" ] && [ "$STATUS" != "completed" ]; then
        echo "⚠️  STATUS ISSUE: Campaign is 100% complete but status is: $STATUS"
        echo "   Recommended Action: Update campaign status to 'completed'"
    elif [ "$WORKER_CAMPAIGN_STATUS" = "processing" ] && [ "$PROGRESS" -lt "100" ]; then
        echo "🐢 TURTLE ISSUE: Campaign appears stuck in processing"
        echo "   Current Progress: $PROGRESS%"
        echo "   Possible Causes:"
        echo "   1. Durable Object alarm not firing"
        echo "   2. AWS SES rate limiting"
        echo "   3. Email sending errors"
        echo "   4. Worker memory/CPU limits hit"
    fi
fi

echo ""
echo "6. 🔧 Recommended Actions"
echo "========================"
echo "Based on the analysis above, try these actions in order:"
echo ""
echo "A. If campaign is stuck but emails were sent:"
echo "   curl -X POST \"$API_URL/api/campaigns/$CAMPAIGN_ID/complete\" \\"
echo "        -H \"Authorization: Bearer $API_KEY\""
echo ""
echo "B. If worker lost state but server has records:"
echo "   curl -X POST \"$API_URL/api/campaigns/$CAMPAIGN_ID/sync-from-db\" \\"
echo "        -H \"Authorization: Bearer $API_KEY\""
echo ""
echo "C. If campaign needs to be restarted:"
echo "   curl -X POST \"$API_URL/api/campaigns/$CAMPAIGN_ID/send\" \\"
echo "        -H \"Authorization: Bearer $API_KEY\""
echo ""
echo "D. If worker needs to be reset:"
echo "   curl -X DELETE \"$WORKER_URL/api/campaign/$CAMPAIGN_ID\" \\"
echo "        -H \"Authorization: Bearer $API_KEY\""
echo ""
echo "🔍 For real-time debugging, run:"
echo "   cd /Users/eyorsogood/Sites/launch.gravitypointmedia.com/server/worker"
echo "   wrangler tail --format pretty"
echo ""
echo "📊 For database inspection, run the SQL queries in debug_turtle_campaign.md"
