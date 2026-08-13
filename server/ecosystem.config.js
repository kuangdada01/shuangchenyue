const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

module.exports = {
  apps: [{
    name: 'shuangchenyue-server',
    script: './dist/index.js',
    cwd: __dirname,
    env: {
      NODE_ENV: 'production',
      PORT: process.env.PORT || 3000,
      JWT_SECRET: process.env.JWT_SECRET,
      ADMIN_EMAIL: process.env.ADMIN_EMAIL,
      SMTP_HOST: process.env.SMTP_HOST,
      SMTP_PORT: process.env.SMTP_PORT,
      SMTP_USER: process.env.SMTP_USER,
      SMTP_PASS: process.env.SMTP_PASS
    },
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    log_date_format: 'YYYY-MM-DD HH:mm:ss'
  }]
};
