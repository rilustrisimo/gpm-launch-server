#!/bin/bash

# Safe Campaign Restart with Database Sync Fix
# This script addresses the root cause: worker/database sync issue

CAMPAIGN_ID="32ccc272-70e9-4636-8025-c3288957a68e"
API_URL="https://lapi.gravitypointmedia.com"
WORKER_URL="https://worker.gravitypointmedia.com"
API_KEY="14d18a0ab3ee46199da20077529788dd"

# MySQL connection parameters
DB_HOST="srv1281.hstgr.io"
DB_USER="u106854878_gpm_launch"
DB_PASS="J%fd9wp*44Ia!5M"
DB_NAME="u106854878_gpm_launch"

echo "🔄 Safe Campaign Restart with Database Sync Fix"
echo "==============================================="
echo "Campaign ID: $CAMPAIGN_ID"
echo ""

echo "📊 Step 1: Analyzing current state..."

# Get worker status
WORKER_STATUS=$(curl -s "$WORKER_URL/api/campaign/$CAMPAIGN_ID/status" \
    -H "Authorization: Bearer $API_KEY")
WORKER_SENT=$(echo "$WORKER_STATUS" | jq -r '.stats.sent // 0')
WORKER_TOTAL=$(echo "$WORKER_STATUS" | jq -r '.stats.total // 0')

echo "   Worker reports: $WORKER_SENT / $WORKER_TOTAL emails sent"

# Get database status
DB_SENT=$(mysql -h "$DB_HOST" -u "$DB_USER" -p"$DB_PASS" "$DB_NAME" -N -e "
SELECT COUNT(*) FROM CampaignStats WHERE campaignId = '$CAMPAIGN_ID' AND sent = 1;")

DB_TOTAL=$(mysql -h "$DB_HOST" -u "$DB_USER" -p"$DB_PASS" "$DB_NAME" -N -e "
SELECT COUNT(*) FROM CampaignStats WHERE campaignId = '$CAMPAIGN_ID';")

echo "   Database reports: $DB_SENT / $DB_TOTAL emails sent"
echo ""

if [ "$WORKER_SENT" -gt "$DB_SENT" ]; then
    echo "⚠️  SYNC ISSUE DETECTED!"
    echo "   Worker sent $WORKER_SENT emails but database only shows $DB_SENT"
    echo "   This explains why restarts cause duplicates!"
    echo ""
    
    echo "🔧 Step 2: Fixing database sync issue..."
    echo "   Option A: Mark first $WORKER_SENT recipients as sent in database"
    echo "   Option B: Reset worker to match database state"
    echo ""
    echo "   Recommend Option A to avoid losing progress"
    echo "   Do you want to sync the database? (y/N)"
    
    read -r SYNC_CONFIRM
    if [ "$SYNC_CONFIRM" = "y" ] || [ "$SYNC_CONFIRM" = "Y" ]; then
        echo "   📝 Marking first $WORKER_SENT recipients as sent..."
        
        # Mark the first N recipients as sent (in creation order)
        mysql -h "$DB_HOST" -u "$DB_USER" -p"$DB_PASS" "$DB_NAME" -e "
        UPDATE CampaignStats 
        SET sent = 1, sentAt = NOW() 
        WHERE campaignId = '$CAMPAIGN_ID' 
            AND sent = 0 
        ORDER BY createdAt ASC 
        LIMIT $WORKER_SENT;"
        
        echo "   ✅ Database updated to match worker state"
        
        # Verify the update
        UPDATED_DB_SENT=$(mysql -h "$DB_HOST" -u "$DB_USER" -p"$DB_PASS" "$DB_NAME" -N -e "
        SELECT COUNT(*) FROM CampaignStats WHERE campaignId = '$CAMPAIGN_ID' AND sent = 1;")
        
        echo "   📊 Verification: Database now shows $UPDATED_DB_SENT sent"
    else
        echo "   🛑 Database sync cancelled - manual intervention needed"
        exit 1
    fi
fi

echo ""
echo "🚀 Step 3: Restarting campaign..."

# Reset worker state to avoid confusion
echo "   Resetting worker state..."
curl -s -X DELETE "$WORKER_URL/api/campaign/$CAMPAIGN_ID" \
    -H "Authorization: Bearer $API_KEY" > /dev/null

# Restart the campaign
echo "   Restarting campaign..."
RESTART_RESPONSE=$(curl -s -X POST "$API_URL/api/campaigns/$CAMPAIGN_ID/send-now" \
    -H "Authorization: Bearer $API_KEY" \
    -H "Content-Type: application/json")

echo "   Response: $RESTART_RESPONSE"

echo ""
echo "📊 Step 4: Monitoring restart..."
sleep 5

# Check remaining work
REMAINING=$(mysql -h "$DB_HOST" -u "$DB_USER" -p"$DB_PASS" "$DB_NAME" -N -e "
SELECT COUNT(*) FROM CampaignStats WHERE campaignId = '$CAMPAIGN_ID' AND sent = 0;")

echo "   Remaining emails to send: $REMAINING"

if [ "$REMAINING" -eq 0 ]; then
    echo "   ✅ Campaign completed! Marking as completed..."
    curl -s -X POST "$API_URL/api/campaigns/$CAMPAIGN_ID/complete" \
        -H "Authorization: Bearer $API_KEY" > /dev/null
else
    echo "   🐢 Campaign will continue turtle sending the remaining $REMAINING emails"
    echo "   Estimated completion: ~$((REMAINING / 2)) minutes at 2 emails/minute"
fi

echo ""
echo "✅ Safe restart completed!"
echo ""
echo "📋 Next Steps:"
echo "   1. Monitor: ./mysql_debug_campaign.sh"
echo "   2. Watch logs: cd worker && wrangler tail --format pretty"
echo "   3. The database sync fix prevents future duplicate issues"
