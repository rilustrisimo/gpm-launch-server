const express = require('express');
const cors = require('cors');
const { sequelize } = require('./models');
require('dotenv').config();

// Import routes
const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/user.routes');
const campaignRoutes = require('./routes/campaign.routes');
const templateRoutes = require('./routes/template.routes');
const contactRoutes = require('./routes/contact.routes');
const contactListRoutes = require('./routes/contactList.routes');
const statsRoutes = require('./routes/stats.routes');
const validationRoutes = require('./routes/validation');
const trackingRoutes = require('./routes/tracking.routes'); // Add tracking routes

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: '*', // Allow all origins
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Handle OPTIONS preflight requests
app.options('*', cors());

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/campaigns', campaignRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/api/contact-lists', contactListRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/validate', validationRoutes);
app.use('/api/tracking', trackingRoutes); // Add tracking routes

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Error handler middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Database connection and server start
const startServer = async () => {
  try {
    // In production (Vercel) environment, we don't need to keep the connection open
    // Just test it during startup to validate config
    if (process.env.NODE_ENV === 'production') {
      await sequelize.authenticate({ retry: { max: 3 } });
      console.log('Database connection test successful');
    } else {
      await sequelize.authenticate();
      console.log('Database connection has been established successfully.');
      
      app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
      });
    }
  } catch (error) {
    console.error('Unable to connect to the database:', error);
    // Don't exit in production - just log the error and continue
    if (process.env.NODE_ENV !== 'production') {
      process.exit(1);
    }
  }
};

// In Vercel's serverless environment, we don't want to block deployment
// on database connection, as each function invocation will establish its own connection
if (process.env.NODE_ENV === 'production') {
  console.log('Production environment detected, continuing deployment');
} else {
  startServer();
}

module.exports = app;