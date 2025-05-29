# Security Best Practices for AWS Credentials

## Never commit credentials to Git

AWS credentials should NEVER be committed to version control systems like Git. This could lead to:
- Unauthorized access to your AWS resources
- Potential data breaches
- Financial costs from unauthorized usage
- Account compromise

## Proper Management of AWS Credentials

### For Development:
1. Store credentials in `.env` files that are listed in `.gitignore`
2. Use `.env.example` files to document the required environment variables (without real values)
3. Each developer should have their own AWS IAM user with limited permissions

### For Production:
1. Use Cloudflare Worker Secrets for storing credentials
   ```bash
   wrangler secret put AWS_ACCESS_KEY_ID --env production
   wrangler secret put AWS_SECRET_ACCESS_KEY --env production
   ```

2. Consider using AWS IAM roles for services when possible
3. Rotate credentials regularly (every 90 days)
4. Enable MFA for all IAM users

### If credentials are accidentally exposed:
1. Rotate the credentials immediately in the AWS console
2. Use BFG Repo-Cleaner to purge the credentials from Git history:
   ```bash
   # Install BFG Repo-Cleaner
   brew install bfg
   
   # Remove sensitive data
   bfg --replace-text sensitive-data.txt my-repo.git
   ```
3. Monitor AWS CloudTrail for any suspicious activity

## Environment Setup Instructions

1. Copy `.env.example` to create your own `.env.production`:
   ```bash
   cp .env.example .env.production
   ```

2. Edit the file with your actual credentials:
   ```bash
   nano .env.production
   ```

3. Deploy your secrets to Cloudflare:
   ```bash
   wrangler secret put AWS_ACCESS_KEY_ID --env production
   wrangler secret put AWS_SECRET_ACCESS_KEY --env production
   wrangler secret put JWT_SECRET --env production
   wrangler secret put DB_PASSWORD --env production
   ```
