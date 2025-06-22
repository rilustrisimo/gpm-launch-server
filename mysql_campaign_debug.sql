-- MySQL Queries for Campaign 32ccc272-70e9-4636-8025-c3288957a68e Debug
-- Run these with: mysql -h srv1281.hstgr.io -u u106854878_gpm_launch -p u106854878_gpm_launch

-- 1. Check campaign basic info
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
FROM campaigns 
WHERE id = '32ccc272-70e9-4636-8025-c3288957a68e';

-- 2. Check campaign stats records
SELECT 
    COUNT(*) as total_recipients,
    SUM(CASE WHEN sent = 1 THEN 1 ELSE 0 END) as sent_count,
    SUM(CASE WHEN delivered = 1 THEN 1 ELSE 0 END) as delivered_count,
    SUM(CASE WHEN opened = 1 THEN 1 ELSE 0 END) as opened_count,
    SUM(CASE WHEN clicked = 1 THEN 1 ELSE 0 END) as clicked_count,
    SUM(CASE WHEN bounced = 1 THEN 1 ELSE 0 END) as bounced_count
FROM campaign_stats 
WHERE campaignId = '32ccc272-70e9-4636-8025-c3288957a68e';

-- 3. Check progress details
SELECT 
    sent,
    delivered,
    opened,
    clicked,
    bounced,
    sentAt,
    deliveredAt,
    COUNT(*) as count
FROM campaign_stats 
WHERE campaignId = '32ccc272-70e9-4636-8025-c3288957a68e'
GROUP BY sent, delivered, opened, clicked, bounced, sentAt, deliveredAt
ORDER BY sent DESC, sentAt DESC;

-- 4. Check which contacts still need emails
SELECT 
    cs.id,
    c.email,
    cs.sent,
    cs.sentAt,
    cs.delivered,
    cs.deliveredAt
FROM campaign_stats cs
JOIN contacts c ON cs.contactId = c.id
WHERE cs.campaignId = '32ccc272-70e9-4636-8025-c3288957a68e'
    AND cs.sent = 0
ORDER BY cs.createdAt ASC
LIMIT 10;

-- 5. Check recently sent emails
SELECT 
    cs.id,
    c.email,
    cs.sent,
    cs.sentAt,
    cs.delivered,
    cs.deliveredAt
FROM campaign_stats cs
JOIN contacts c ON cs.contactId = c.id
WHERE cs.campaignId = '32ccc272-70e9-4636-8025-c3288957a68e'
    AND cs.sent = 1
ORDER BY cs.sentAt DESC
LIMIT 10;

-- 6. Get campaign completion percentage
SELECT 
    total_recipients,
    sent_count,
    ROUND((sent_count / total_recipients) * 100, 2) as completion_percentage
FROM (
    SELECT 
        COUNT(*) as total_recipients,
        SUM(CASE WHEN sent = 1 THEN 1 ELSE 0 END) as sent_count
    FROM campaign_stats 
    WHERE campaignId = '32ccc272-70e9-4636-8025-c3288957a68e'
) stats;
