#!/bin/bash

# Script to run the new tracking field migrations
# Run with: bash run-tracking-migrations.sh

echo "Running migrations to add tracking fields..."

# Change to the server directory if needed
cd "$(dirname "$0")"

# Run the Sequelize migrations
echo "Running migration: add-tracking-fields-to-contact"
npx sequelize-cli db:migrate --name 20250602000000-add-tracking-fields-to-contact.js

echo "Running migration: add-tracking-counters-to-campaign"
npx sequelize-cli db:migrate --name 20250602000001-add-tracking-counters-to-campaign.js

echo "Running migration: add-stopped-status-to-campaign"
npx sequelize-cli db:migrate --name 20250602000002-add-stopped-status-to-campaign.js

echo "Migration complete!"
echo "Use this command to undo if needed: npx sequelize-cli db:migrate:undo:all"
