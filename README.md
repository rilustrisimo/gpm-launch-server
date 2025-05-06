# Launch Email Campaign API

This is the backend API for the Launch Email Campaign Management System. It provides endpoints to manage campaigns, templates, contacts, and contact lists.

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