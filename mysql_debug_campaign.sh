#!/bin/bash

# MySQL Campaign Diagnostic Script
CAMPAIGN_ID="32ccc272-70e9-4636-8025-c3288957a68e"

echo "🔍 MySQL Campaign Analysis for: $CAMPAIGN_ID"
echo "=============================================="

# MySQL connection parameters from .env
DB_HOST="srv1281.hstgr.io"
DB_USER="u106854878_gpm_launch"
DB_PASS="J%fd9wp*44Ia!5M"
DB_NAME="u106854878_gpm_launch"

echo ""
echo "1. 📊 Campaign Basic Info"
echo "========================="
mysql -h "$DB_HOST" -u "$DB_USER" -p"$DB_PASS" "$DB_NAME" -e "
SELECT 
    id,
    name,
    status,
    sendingMode,
    emailsPerMinute,
    totalRecipients,
    sent,
    delivered,
    sentAt,
    createdAt
FROM Campaigns 
WHERE id = '$CAMPAIGN_ID';"

echo ""
echo "2. 📈 Campaign Stats Summary"
echo "============================"
mysql -h "$DB_HOST" -u "$DB_USER" -p"$DB_PASS" "$DB_NAME" -e "
SELECT 
    COUNT(*) as total_recipients,
    SUM(CASE WHEN sent = 1 THEN 1 ELSE 0 END) as sent_count,
    SUM(CASE WHEN delivered = 1 THEN 1 ELSE 0 END) as delivered_count,
    SUM(CASE WHEN opened = 1 THEN 1 ELSE 0 END) as opened_count,
    SUM(CASE WHEN clicked = 1 THEN 1 ELSE 0 END) as clicked_count,
    SUM(CASE WHEN bounced = 1 THEN 1 ELSE 0 END) as bounced_count,
    ROUND((SUM(CASE WHEN sent = 1 THEN 1 ELSE 0 END) / COUNT(*)) * 100, 2) as completion_percentage
FROM CampaignStats 
WHERE campaignId = '$CAMPAIGN_ID';"

echo ""
echo "3. 🐢 Remaining Recipients (First 5)"
echo "====================================="
mysql -h "$DB_HOST" -u "$DB_USER" -p"$DB_PASS" "$DB_NAME" -e "
SELECT 
    c.email,
    cs.sent,
    cs.sentAt,
    cs.delivered,
    cs.deliveredAt
FROM CampaignStats cs
JOIN Contacts c ON cs.contactId = c.id
WHERE cs.campaignId = '$CAMPAIGN_ID'
    AND cs.sent = 0
ORDER BY cs.createdAt ASC
LIMIT 5;"

echo ""
echo "4. ✅ Recently Sent (Last 5)"
echo "============================="
mysql -h "$DB_HOST" -u "$DB_USER" -p"$DB_PASS" "$DB_NAME" -e "
SELECT 
    c.email,
    cs.sent,
    cs.sentAt,
    cs.delivered,
    cs.deliveredAt
FROM CampaignStats cs
JOIN Contacts c ON cs.contactId = c.id
WHERE cs.campaignId = '$CAMPAIGN_ID'
    AND cs.sent = 1
ORDER BY cs.sentAt DESC
LIMIT 5;"

echo ""
echo "5. 🔍 Progress Breakdown"
echo "========================"
mysql -h "$DB_HOST" -u "$DB_USER" -p"$DB_PASS" "$DB_NAME" -e "
SELECT 
    CASE 
        WHEN sent = 1 AND delivered = 1 THEN 'Sent & Delivered'
        WHEN sent = 1 AND delivered = 0 THEN 'Sent (Not Delivered)'
        WHEN sent = 0 THEN 'Pending'
        ELSE 'Unknown'
    END as status,
    COUNT(*) as count,
    ROUND((COUNT(*) / (SELECT COUNT(*) FROM CampaignStats WHERE campaignId = '$CAMPAIGN_ID')) * 100, 2) as percentage
FROM CampaignStats 
WHERE campaignId = '$CAMPAIGN_ID'
GROUP BY sent, delivered
ORDER BY sent DESC, delivered DESC;"
