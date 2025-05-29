# GPM Launch Client Deployment Guide

This guide explains how to deploy the React client for the GPM Launch email campaign system to Cloudflare Pages.

## Prerequisites

- Node.js v18+ installed
- Wrangler CLI installed (`npm install -g wrangler`)
- Cloudflare account with access to Pages
- React client codebase ready for deployment

## Setup Instructions

### 1. Configure Environment Variables

Create a `.env.production` file in your client directory:

```
REACT_APP_API_URL=https://api.gravitypointmedia.com
REACT_APP_TRACKING_URL=https://trk.gravitypointmedia.com
```

### 2. Build the Client

```bash
cd /path/to/client
npm install
npm run build
```

This will create an optimized production build in the `build` directory.

### 3. Add Routing Configuration

Create a `_redirects` file in the `public` directory to handle client-side routing:

```
/*    /index.html   200
```

### 4. Deploy to Cloudflare Pages

```bash
# First time setup
wrangler pages project create gpm-launch-ui

# Deploy
wrangler pages publish build --project-name=gpm-launch-ui
```

### 5. Configure Custom Domain

1. Go to the Cloudflare Dashboard
2. Navigate to "Pages"
3. Select your project "gpm-launch-ui"
4. Go to "Custom domains"
5. Add your domain (e.g., launch.gravitypointmedia.com)
6. Follow the DNS verification process

## Environment Variables in Cloudflare Pages

You can also set environment variables in the Cloudflare Dashboard:

1. Go to "Pages" > "gpm-launch-ui" > "Settings" > "Environment variables"
2. Add the following variables:
   - `REACT_APP_API_URL`: https://api.gravitypointmedia.com
   - `REACT_APP_TRACKING_URL`: https://trk.gravitypointmedia.com

## Continuous Deployment

For automatic deployments, connect your GitHub repository:

1. Go to "Pages" > "Create a project" > "Connect to Git"
2. Select your repository and configure the build settings:
   - Build command: `npm run build`
   - Build output directory: `build`
   - Environment variables: Configure as above

## Testing Your Deployment

1. Visit your Pages URL (e.g., https://gpm-launch-ui.pages.dev)
2. Test all major features: authentication, campaigns, templates, contacts, etc.
3. Check that API calls are working correctly
4. Verify email tracking functionality
