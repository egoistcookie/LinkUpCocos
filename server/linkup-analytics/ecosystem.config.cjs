/**
 * PM2：pm2 start ecosystem.config.cjs
 * 部署目录按实际修改 cwd
 */
module.exports = {
  apps: [
    {
      name: 'linkup-analytics',
      cwd: '/var/www/tower-defense-api/linkup-analytics',
      script: 'app.py',
      interpreter: 'python3',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '200M',
      env: {
        LINKUP_ANALYTICS_CONFIG: '/var/www/tower-defense-api/linkup-analytics/config.json',
      },
      error_file: '/var/www/tower-defense-api/linkup-analytics/logs/err.log',
      out_file: '/var/www/tower-defense-api/linkup-analytics/logs/out.log',
      merge_logs: true,
      time: true,
    },
  ],
};
