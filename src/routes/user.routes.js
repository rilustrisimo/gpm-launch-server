const express = require('express');
const { body } = require('express-validator');
const userController = require('../controllers/user.controller');
const { auth } = require('../middleware/auth.middleware');

const router = express.Router();

// Apply auth middleware to all routes
router.use(auth);

// Get current user profile
router.get('/profile', userController.getProfile);

// Update user profile
router.put(
  '/profile',
  [
    body('firstName').optional(),
    body('lastName').optional(),
    body('email').optional().isEmail().withMessage('Please include a valid email')
  ],
  userController.updateProfile
);

// Change password
router.put(
  '/password',
  [
    body('currentPassword', 'Current password is required').notEmpty(),
    body('newPassword', 'New password must be at least 6 characters').isLength({ min: 6 })
  ],
  userController.changePassword
);

module.exports = router; 