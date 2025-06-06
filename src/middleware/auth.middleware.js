const jwt = require('jsonwebtoken');
const { User } = require('../models');

/**
 * Middleware to authenticate JWT token
 */
exports.auth = async (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided or invalid format.'
      });
    }

    const token = authHeader.split(' ')[1];

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Check if user exists
    const user = await User.findByPk(decoded.id, {
      attributes: { exclude: ['password'] }
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token. User not found.'
      });
    }

    if (!user.active) {
      return res.status(401).json({
        success: false,
        message: 'User account has been deactivated.'
      });
    }

    // Add user to request
    req.user = decoded;
    next();
  } catch (error) {
    console.error('Auth error:', error);
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token.'
      });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expired.'
      });
    }
    return res.status(500).json({
      success: false,
      message: 'Server error during authentication.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Middleware to check admin role
 */
exports.admin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Admin permission required.'
    });
  }
};

/**
 * Middleware to validate API key for worker-to-server communication
 * This is used for the tracking API endpoints that receive data from the worker
 */
exports.validateApiKey = (req, res, next) => {
  try {
    console.log('🔑 Tracking API request received:');
    console.log(`- Path: ${req.path}`);
    console.log(`- Method: ${req.method}`);
    
    // IMPORTANT: Don't log all headers as they might contain sensitive info
    // Just log necessary parts for debugging
    const authHeader = req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('❌ Auth header missing or invalid format');
      return res.status(401).json({
        success: false,
        message: 'Access denied. No API key provided or invalid format.'
      });
    }

    const apiKey = authHeader.split(' ')[1];
    
    // Only log portions of the keys for security
    if (apiKey && apiKey.length > 10) {
      console.log(`- Received API key: ${apiKey.substring(0, 5)}...${apiKey.substring(apiKey.length - 5)}`);
    } else {
      console.log(`- Received API key: [INVALID FORMAT]`);
    }
    
    if (process.env.WORKER_API_KEY && process.env.WORKER_API_KEY.length > 10) {
      console.log(`- Expected API key: ${process.env.WORKER_API_KEY.substring(0, 5)}...${process.env.WORKER_API_KEY.substring(process.env.WORKER_API_KEY.length - 5)}`);
    } else {
      console.log(`- Expected API key: [NOT PROPERLY SET]`);
      console.log(`- Check environment variable WORKER_API_KEY in server configuration`);
    }

    // Validate API key against environment variable
    if (!process.env.WORKER_API_KEY) {
      console.error('❌ WORKER_API_KEY environment variable is not set');
      return res.status(500).json({
        success: false,
        message: 'Server configuration error: API key not set'
      });
    }
    
    if (apiKey !== process.env.WORKER_API_KEY) {
      console.log('❌ API key validation failed');
      return res.status(401).json({
        success: false,
        message: 'Invalid API key.'
      });
    }
    
    console.log('✅ API key validation successful');
    next();
  } catch (error) {
    console.error('API key validation error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error during authentication.'
    });
  }
};