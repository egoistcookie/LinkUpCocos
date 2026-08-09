# LinkUp 埋点服务（PM2 + Nginx）

域名：`https://www.egoistcookie.top`  
建议目录：`/var/www/tower-defense-api/linkup-analytics/`

---

## 1. 上传与建表

```bash
sudo mkdir -p /var/www/tower-defense-api/linkup-analytics/logs
# 把本目录文件拷到服务器上述路径后：
cd /var/www/tower-defense-api/linkup-analytics
cp config.example.json config.json
# 编辑 config.json：填 MySQL 账号；host 保持 127.0.0.1（只给本机 Nginx 反代）

# 建库建表
mysql -uroot -p < schema.sql
# 建专用用户（先改 create_user.sql 里的密码）
mysql -uroot -p < create_user.sql
# 远程示例：mysql -h120.77.92.36 -uroot -p < create_user.sql
python3 -m pip install --user -r requirements.txt
# 若仍提示找不到包，先看版本：python3 --version（建议 >=3.6）
```


专用账号：`linkup` / 见 `create_user.sql`  
JDBC：`jdbc:mysql://120.77.92.36:3306/linkup_analytics?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=UTC`


---

## 2. PM2 启动

需已安装：`npm i -g pm2`

```bash
cd /var/www/tower-defense-api/linkup-analytics
# 若目录不是默认路径，先改 ecosystem.config.cjs 里的 cwd / 日志路径
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup   # 按提示执行一条 sudo 命令，开机自启
```

常用命令：

```bash
pm2 status
pm2 logs linkup-analytics
pm2 restart linkup-analytics
pm2 stop linkup-analytics
```

本机探活（不走 Nginx）：

```bash
curl -s http://127.0.0.1:8765/api/linkup/health
# 期望：{"code":0,"msg":"ok","data":{"service":"linkup-analytics"}}
```

---

## 3. Nginx 反代

在 **已有** `www.egoistcookie.top` 的 `server { ... }`（443）里增加一段：

```nginx
location /api/linkup/ {
    proxy_pass http://127.0.0.1:8765;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_connect_timeout 5s;
    proxy_send_timeout 15s;
    proxy_read_timeout 15s;
    client_max_body_size 256k;
}
```

完整片段见 `nginx.linkup.conf.example`。

改完后：

```bash
sudo nginx -t
sudo nginx -s reload
# 或：sudo systemctl reload nginx
```

外网探活：

```bash
curl -s https://www.egoistcookie.top/api/linkup/health
```

---

## 4. 接口一览

| Method | Path | 说明 |
|--------|------|------|
| POST | `/api/linkup/level/start` | 开局新增 |
| POST | `/api/linkup/level/end` | 结算更新 |
| POST | `/api/linkup/event` | 购买 / 卡组 |
| GET | `/api/linkup/health` | 健康检查 |

微信小游戏后台：把 `www.egoistcookie.top` 配进 **request 合法域名**。

---

## 5. 排错

| 现象 | 处理 |
|------|------|
| `pm2` 起不来 | `pm2 logs linkup-analytics` 看 Python/依赖/config 路径 |
| 本机 health 通、外网 502 | Nginx 未 reload，或 `proxy_pass` 端口不是 8765 |
| 外网 404 | location 没加进正确的 server_name / 站点 conf |
| 微信请求失败 | 未配合法域名，或未走 HTTPS |
| 入表失败 | MySQL 账号、库名、`schema.sql` 是否已执行 |
