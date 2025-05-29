# GPM Launch - Email Campaign Server

This is the backend API server for GPM Launch email campaign management platform. The system uses Node.js for the main API and Cloudflare Workers with Durable Objects for the scalable email sending functionality.

## Architecture Overview

The system consists of two main components:

1. **Node.js API Server**: Handles authentication, data storage, and business logic
2. **Cloudflare Workers**: Processes email campaigns asynchronously for maximum scalability

### Email Campaign Processing Flow

1. Campaign is created in the main database via Node.js API
2. When a campaign is scheduled or sent immediately, the API initializes a new Durable Object instance in Cloudflare
3. The Cloudflare Worker processes the email sending in batches using its Durable Object for state management
4. Campaign progress and statistics are tracked in KV storage
5. Opens and clicks are tracked with special tracking pixels and URLs

## Setup Instructions

### 1. Cloudflare Workers Setup

#### Prerequisites

- A Cloudflare account
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/) installed

#### Create KV Namespace

```bash
# Login to Cloudflare
wrangler login

# Create KV namespace for email tracking
wrangler kv:namespace create EMAIL_TRACKING
wrangler kv:namespace create EMAIL_TRACKING --preview
```

Update the `wrangler.toml` file with the generated KV namespace IDs.

#### Deploy the Worker

```bash
# Deploy to Cloudflare
cd server
wrangler publish
```

#### Verify the Deployment

Once deployed, you should be able to access your worker at:
`https://gpm-email-worker.<your-account>.workers.dev`

### 2. API Server Configuration

The Node.js API server needs to be configured to communicate with the Cloudflare Worker. Add these environment variables to your `.env` file:

```
# Cloudflare Worker
WORKER_URL=https://gpm-email-worker.<your-account>.workers.dev
WORKER_API_KEY=<generate-a-secure-api-key>
```

## Usage

### Sending Email Campaigns

When a campaign is ready to be sent, the API orchestrates the process:

1. The campaign data is loaded from the database including the recipient list and template
2. A request is sent to the Cloudflare Worker to initialize the campaign
3. Another request starts the processing
4. The API can poll the worker for status updates

### Tracking Campaign Metrics

- Open tracking: Uses a 1x1 transparent pixel in the email
- Click tracking: Rewrites links to pass through the tracking server
- All metrics are stored in Cloudflare KV for fast access

## Development

### Testing Locally

You can test the worker locally using Wrangler:

```bash
cd server
wrangler dev
```

### Debugging

For debugging worker issues:

1. Check the Cloudflare Workers dashboard for logs
2. Enable verbose logging in wrangler.toml
3. Test API endpoints with Postman or similar tools

## Security Considerations

- Worker API Key: The WORKER_API_KEY should be kept secret
- Rate Limiting: Configure rate limits in wrangler.toml to prevent abuse
- User Data: Ensure compliance with privacy regulations like GDPR when storing email data

## Technology Stack

- Node.js
- Express.js
- MySQL
- Sequelize ORM

## Getting Started

### Prerequisites

- Node.js (v14+)
- MySQL (v5.7+)

### Installation

1. Clone the repository
2. Install dependencies:
   ```
   npm install
   ```
3. Create a `.env` file based on `.env.example` and update with your configuration:
   ```
   NODE_ENV=development
   PORT=5000
   
   # Database
   DB_USERNAME=your_db_username
   DB_PASSWORD=your_db_password
   DB_DATABASE=launch_db
   DB_HOST=localhost
   DB_DIALECT=mysql
   
   # JWT
   JWT_SECRET=your_jwt_secret_key_here
   JWT_EXPIRES_IN=7d
   
   # Email (for future implementation)
   EMAIL_FROM=noreply@example.com
   ```

### Database Setup

1. Create the database:
   ```sql
   CREATE DATABASE launch_db;
   ```

2. Run migrations:
   ```
   npm run migrate
   ```

3. Seed the database with initial data:
   ```
   npm run seed
   ```

### Running the Server

Development mode with auto-restart:
```
npm run dev
```

Production mode:
```
npm start
```

## API Documentation

### Authentication

- POST `/api/auth/register` - Register a new user
- POST `/api/auth/login` - Login user
- GET `/api/auth/me` - Get current user

### User Management

- GET `/api/users/profile` - Get user profile
- PUT `/api/users/profile` - Update user profile
- PUT `/api/users/password` - Change password

### Campaigns

- GET `/api/campaigns` - Get all campaigns
- GET `/api/campaigns/:id` - Get campaign by ID
- GET `/api/campaigns/:id/stats` - Get campaign statistics
- POST `/api/campaigns` - Create a new campaign
- PUT `/api/campaigns/:id` - Update a campaign
- DELETE `/api/campaigns/:id` - Delete a campaign

### Templates

- GET `/api/templates` - Get all templates
- GET `/api/templates/:id` - Get template by ID
- POST `/api/templates` - Create a new template
- PUT `/api/templates/:id` - Update a template
- DELETE `/api/templates/:id` - Delete a template

### Contacts

- GET `/api/contacts` - Get all contacts
- GET `/api/contacts/:id` - Get contact by ID
- POST `/api/contacts` - Create a new contact
- PUT `/api/contacts/:id` - Update a contact
- DELETE `/api/contacts/:id` - Delete a contact

### Contact Lists

- GET `/api/contact-lists` - Get all contact lists
- GET `/api/contact-lists/:id` - Get contact list by ID
- GET `/api/contact-lists/:id/contacts` - Get contacts in a list
- POST `/api/contact-lists` - Create a new contact list
- PUT `/api/contact-lists/:id` - Update a contact list
- DELETE `/api/contact-lists/:id` - Delete a contact list
- POST `/api/contact-lists/:id/contacts` - Add contacts to a list
- DELETE `/api/contact-lists/:id/contacts` - Remove contacts from a list

### Statistics

- GET `/api/stats/dashboard` - Get dashboard statistics
- GET `/api/stats/campaigns` - Get campaign performance statistics
- GET `/api/stats/contacts` - Get contact growth statistics

## License

This project is licensed under the MIT License. 