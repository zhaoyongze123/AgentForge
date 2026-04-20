# AgentForge 运维 Runbook

## 1. 本地开发

### 启动

```bash
docker compose -f docker-compose.dev.yml up --build
```

访问：

- 控制平面: `http://127.0.0.1:3000`
- 控制台: `http://127.0.0.1:3000/console`
- Temporal UI: `http://127.0.0.1:8088`

### 停止

```bash
docker compose -f docker-compose.dev.yml down
```

## 2. 发布前检查

```bash
./scripts/release-check.sh
```

检查内容：

- `npm run typecheck`
- `npm test`
- `docker compose config`
- `docker build`

## 3. Staging 部署

准备：

1. 复制 `.env.staging.example` 为 `.env.staging`
2. 填入真实环境变量
3. 设置 `REMOTE_HOST`

执行：

```bash
REMOTE_HOST=root@example.com ./scripts/deploy-staging.sh
```

## 4. Production 部署

准备：

1. 复制 `.env.production.example` 为 `.env.production`
2. 填入真实环境变量
3. 设置 `REMOTE_HOST`

执行：

```bash
REMOTE_HOST=root@example.com ./scripts/deploy-production.sh
```

如需跳过本地发布前检查：

```bash
SKIP_RELEASE_CHECK=true REMOTE_HOST=root@example.com ./scripts/deploy-production.sh
```

## 5. 备份与恢复

### 备份

```bash
./scripts/backup.sh
```

默认备份目录：

- `.agentforge`
- 输出到 `.backups/agentforge-backup-*.tgz`

### 恢复

```bash
./scripts/restore.sh .backups/agentforge-backup-20260417-120000.tgz
```

## 6. 常见故障

### 控制平面无法启动

检查：

```bash
docker logs agentforge-production
```

重点看：

- 环境变量缺失
- `DATABASE_URL` 路径权限
- `OBSIDIAN_ROOT` 是否误启用

### 飞书回调失败

检查：

1. `FEISHU_VERIFICATION_TOKEN`
2. `FEISHU_ENCRYPT_KEY`
3. Nginx 反代是否指向正确端口
4. 容器日志中是否出现 `feishu.card_action.unmatched`

### Temporal 不可用

检查：

```bash
docker ps | grep temporal
curl http://127.0.0.1:8088
```

## 7. 关键验收地址

- `/health`
- `/metrics`
- `/console`
- `/api/alerts`
- `/api/audit`
