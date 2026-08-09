-- 连连看独立库专用账号（在服务器上用 root 执行）
-- mysql -h120.77.92.36 -uroot -p < create_user.sql
-- 或 SSH 上机后：mysql -uroot -p < create_user.sql
--
-- 执行后请把下面密码改成你自己的强密码，并同步到 config.json / DBeaver

CREATE DATABASE IF NOT EXISTS linkup_analytics
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

-- 远程（DBeaver）+ 本机服务（PM2 连 127.0.0.1）
CREATE USER IF NOT EXISTS 'linkup'@'%' IDENTIFIED BY 'Srcb@2025';
CREATE USER IF NOT EXISTS 'linkup'@'localhost' IDENTIFIED BY 'Srcb@2025';

GRANT ALL PRIVILEGES ON linkup_analytics.* TO 'linkup'@'%';
GRANT ALL PRIVILEGES ON linkup_analytics.* TO 'linkup'@'localhost';

FLUSH PRIVILEGES;
