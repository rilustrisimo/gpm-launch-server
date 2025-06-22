#!/bin/bash

# Safe Turtle Campaign Restart Script
# This script ensures no duplicate emails are sent

CAMPAIGN_ID="32ccc272-70e9-4636-8025-c3288957a68e"
API_URL="https://lapi.gravitypointmedia.com"
API_KEY="14d18a0ab3ee46199da20077529788dd"

echo "🔄 Safe Turtle Campaign Restart"
echo "==============================="
echo "Campaign ID: $CAMPAIGN_ID"
echo ""

# Step 1: Check current status
echo "📊 Step 1: Checking current campaign status..."
CURRENT_STATUS=$(curl -s "$API_URL/api/campaigns/$CAMPAIGN_ID/stats" \
    -H "Authorization: Bearer $API_KEY" | jq -r '.campaign.status // "unknown"')

echo "   Current Status: $CURRENT_STATUS"

if [ "$CURRENT_STATUS" = "completed" ]; then
    echo "   ✅ Campaign is already completed - no action needed"
    exit 0
fi

# Step 2: Get recipient counts
echo ""
echo "📈 Step 2: Checking recipient progress..."
STATS_RESPONSE=$(curl -s "$API_URL/api/campaigns/$CAMPAIGN_ID/stats" \
    -H "Authorization: Bearer $API_KEY")

TOTAL_RECIPIENTS=$(echo "$STATS_RESPONSE" | jq -r '.stats.totalRecipients // 0')
SENT_COUNT=$(echo "$STATS_RESPONSE" | jq -r '.stats.sent // 0')
REMAINING=$(($TOTAL_RECIPIENTS - $SENT_COUNT))

echo "   Total Recipients: $TOTAL_RECIPIENTS"
echo "   Already Sent: $SENT_COUNT"  
echo "   Remaining: $REMAINING"

if [ "$REMAINING" -eq 0 ]; then
    echo "   ✅ All emails sent - marking campaign as completed"
    # Force complete the campaign
    curl -s -X POST "$API_URL/api/campaigns/$CAMPAIGN_ID/complete" \
        -H "Authorization: Bearer $API_KEY" > /dev/null
    echo "   ✅ Campaign marked as completed"
    exit 0
fi

# Step 3: Safety confirmation
echo ""
echo "⚠️  Step 3: Safety Confirmation"
echo "   This will send $REMAINING emails to the remaining recipients"
echo "   The system will automatically skip the $SENT_COUNT already sent emails"
echo "   Do you want to continue? (y/N)"

read -r CONFIRM
if [ "$CONFIRM" != "y" ] && [ "$CONFIRM" != "Y" ]; then
    echo "   🛑 Restart cancelled by user"
    exit 0
fi

# Step 4: Restart the campaign
echo ""
echo "🚀 Step 4: Restarting turtle campaign..."
echo "   Calling: POST $API_URL/api/campaigns/$CAMPAIGN_ID/send-now"

RESTART_RESPONSE=$(curl -s -X POST "$API_URL/api/campaigns/$CAMPAIGN_ID/send-now" \
    -H "Authorization: Bearer $API_KEY" \
    -H "Content-Type: application/json" \
    -w "HTTP_STATUS:%{http_code}")

HTTP_STATUS=$(echo "$RESTART_RESPONSE" | grep -o "HTTP_STATUS:[0-9]*" | cut -d: -f2)
RESPONSE_BODY=$(echo "$RESTART_RESPONSE" | sed 's/HTTP_STATUS:[0-9]*$//')

echo "   HTTP Status: $HTTP_STATUS"

if [ "$HTTP_STATUS" = "200" ]; then
    echo "   ✅ Campaign restart successful!"
    if [ -n "$RESPONSE_BODY" ]; then
        echo "   Response: $RESPONSE_BODY" | jq . 2>/dev/null || echo "   Response: $RESPONSE_BODY"
    fi
else
    echo "   ❌ Campaign restart failed"
    echo "   Error: $RESPONSE_BODY"
    exit 1
fi

# Step 5: Monitor restart
echo ""
echo "📊 Step 5: Monitoring restart progress..."
echo "   Waiting 10 seconds for processing to begin..."
sleep 10

# Check status after restart
NEW_STATUS=$(curl -s "$API_URL/api/campaigns/$CAMPAIGN_ID/stats" \
    -H "Authorization: Bearer $API_KEY" | jq -r '.campaign.status // "unknown"')

echo "   New Status: $NEW_STATUS"

if [ "$NEW_STATUS" = "sending" ] || [ "$NEW_STATUS" = "processing" ]; then
    echo "   ✅ Campaign is now processing!"
    echo ""
    echo "📋 Next Steps:"
    echo "   1. Monitor progress with: ./debug_campaign.sh $CAMPAIGN_ID"
    echo "   2. Watch real-time logs with: cd worker && wrangler tail --format pretty"
    echo "   3. Check status periodically - turtle send at your configured rate"
    echo ""
    echo "🐢 Turtle send will continue from email #$((SENT_COUNT + 1)) to #$TOTAL_RECIPIENTS"
    echo "   Estimated completion time: ~$((REMAINING / 30)) minutes (assuming 30 emails/min)"
else
    echo "   ⚠️  Status didn't change to processing - check logs for issues"
    echo "   Run: ./debug_campaign.sh $CAMPAIGN_ID for detailed analysis"
fi

echo ""
echo "✅ Restart process completed!"
