#!/bin/bash

# GPM Launch Email Campaign System Deployment Script

echo "Starting deployment of GPM Launch Email Campaign System..."

# Step 1: Install dependencies
echo "Installing dependencies..."
npm install

# Step 2: Set up environment variables
echo "Setting up environment variables for production..."
cp .env.production .env

# Step 3: Run database migrations
echo "Running database migrations..."
NODE_ENV=production npm run migrate

# Step 4: Deploy the worker
echo "Deploying the worker to Cloudflare..."
wrangler deploy workers/emailWorker.js --env production

# Step 5: Deploy the tracking worker (if exists)
if [ -f "workers/trackingWorker.js" ]; then
  echo "Deploying tracking worker..."
  wrangler deploy workers/trackingWorker.js --name gpm-tracking-worker --env production
fi

echo "Deployment complete!"