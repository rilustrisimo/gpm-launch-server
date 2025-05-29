const { body } = require('express-validator');

// Validate template tokens
const validateTemplateTokens = (content) => {
  const validTokens = [
    '{{first_name}}',
    '{{last_name}}',
    '{{email}}',
    '{{company}}',
    '{{unsubscribe_link}}',
    '{{current_date}}'
  ];
  
  const tokenRegex = /{{([^}]+)}}/g;
  const foundTokens = content.match(tokenRegex) || [];
  
  const invalidTokens = foundTokens.filter(token => !validTokens.includes(token));
  
  if (invalidTokens.length > 0) {
    throw new Error(`Invalid tokens found: ${invalidTokens.join(', ')}`);
  }
  
  return true;
};

// Template validation middleware
exports.validateTemplate = [
  body('name', 'Template name is required').notEmpty(),
  body('subject', 'Subject line is required').notEmpty(),
  body('content', 'Content is required').notEmpty()
    .custom(validateTemplateTokens),
  body('description').optional(),
  body('category').optional(),
  body('thumbnail').optional().isURL().withMessage('Thumbnail must be a valid URL')
];

// Process template content with tokens
exports.processTemplateContent = (content, contact) => {
  let processedContent = content;
  
  // Replace tokens with contact data
  if (contact) {
    processedContent = processedContent
      .replace(/{{first_name}}/g, contact.firstName || '')
      .replace(/{{last_name}}/g, contact.lastName || '')
      .replace(/{{email}}/g, contact.email || '')
      .replace(/{{company}}/g, contact.company || '');
  }
  
  // Replace system tokens
  processedContent = processedContent
    .replace(/{{current_date}}/g, new Date().toLocaleDateString())
    .replace(/{{unsubscribe_link}}/g, `[Unsubscribe](${process.env.APP_URL}/unsubscribe/${contact?.id})`);
  
  return processedContent;
}; 