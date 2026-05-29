# FinClaw 多租户技术方案

## 1. 现状分析

| 维度 | 当前状态 |
|------|---------|
| 数据存储 | 纯文件系统（JSON/TOML/Markdown），无数据库 |
| 认证鉴权 | 无，所有接口完全开放 |
| 租户概念 | 无，单用户本地运行 |
| 隔离级别 | 无，所有 Agent 共享同一文件空间 |
| API 层 | Gin 框架，无中间件鉴权链 |
| WebSocket | session_id 仅做消息路由，无身份绑定 |
| 前端 | 无登录页，localStorage 存聊天记录 |

**核心矛盾**：从"单用户本地工具"升级为"多租户 SaaS 平台"，需要补齐数据库、认证、隔离三大基础设施。

---

## 2. 架构目标

1. **租户隔离**：不同租户的 Agent、聊天记录、工作空间文件完全隔离，互不可见
2. **用户体系**：支持注册/登录，用户可属于多个租户，租户内区分角色
3. **最小改动**：尽量复用现有 PicoClaw Agent 运行时，不侵入其内部
4. **渐进演进**：方案分阶段，可先落地核心租户隔离，再逐步完善

---

## 3. 租户隔离策略选择

### 三种主流方案对比

| 方案 | 隔离强度 | 实现成本 | 运维成本 | 适合场景 |
|------|---------|---------|---------|---------|
| **A. 共享库 + tenant_id** | 逻辑隔离，依赖代码严谨性 | 低 | 低（单库） | 租户多、数据量适中 |
| **B. Schema 隔离** | 中等，同库不同 schema | 中 | 中 | 租户数量可控，需较强隔离 |
| **C. 独立数据库** | 最强，物理隔离 | 高 | 高（多库维护） | 金融/合规，租户少 |

### 推荐：方案 A — 共享数据库 + tenant_id 行级隔离

理由：
- FinClaw 租户规模预期中小（非金融核心系统），逻辑隔离足够
- 实现成本最低，单库运维简单
- 可通过数据库 Row-Level Security (RLS) 加固，避免应用层遗漏
- 未来如需升级到方案 C，可按租户迁移，方案 A 是最自然的起点

---

## 4. 数据库选型

### 推荐：PostgreSQL

理由：
- 原生支持 Row-Level Security (RLS)，租户隔离有数据库级保障
- JSONB 类型适合存储 Agent 配置（当前为 JSON 文件），无需严格 schema
- 成熟的 Go 生态驱动（pgx），GORM 对 PG 支持最好
- 未来可扩展到 Schema 隔离（同一 PG 实例多 schema）
- 项目已间接依赖 `modernc.org/sqlite`（通过 PicoClaw），但 PG 的 RLS 是决定性优势

### ORM：GORM

- Go 生态最成熟，PG 支持完善
- 支持 Hook/Callback，可自动注入 tenant_id 查询条件
- 自带 Migration，与方案渐进演进匹配

---

## 5. 数据模型设计

### 5.1 核心实体关系

```
User ──M:N── Tenant (通过 TenantMember)
  │
  └── TenantMember (角色: owner/admin/member)
        │
        └── Agent (属于 Tenant)
              │
              ├── ChatSession (属于 Agent + User)
              │     └── ChatMessage (属于 ChatSession)
              │
              └── WorkspaceFile (属于 Agent，存 persona 文件)
```

### 5.2 表结构

#### tenants（租户表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID PK | 租户 ID |
| name | VARCHAR(64) | 租户名称 |
| slug | VARCHAR(64) UNIQUE | 租户标识（用于 URL） |
| plan | VARCHAR(32) | 套餐：free/pro/enterprise |
| max_agents | INT | 最大 Agent 数 |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

#### users（用户表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID PK | 用户 ID |
| email | VARCHAR(255) UNIQUE | 登录邮箱 |
| password_hash | VARCHAR(255) | bcrypt 哈希 |
| display_name | VARCHAR(64) | 显示名 |
| avatar_url | VARCHAR(512) | 头像 |
| status | VARCHAR(16) | active/disabled |
| last_login_at | TIMESTAMP | |
| created_at | TIMESTAMP | |

#### tenant_members（租户成员表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID PK | |
| tenant_id | UUID FK → tenants | |
| user_id | UUID FK → users | |
| role | VARCHAR(16) | owner/admin/member |
| joined_at | TIMESTAMP | |
| UNIQUE(tenant_id, user_id) | | |

#### agents（Agent 表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID PK | |
| tenant_id | UUID FK → tenants | 租户 ID，隔离键 |
| name | VARCHAR(64) | Agent 名称 |
| model_provider | VARCHAR(64) | LLM 供应商 |
| config_json | JSONB | PicoClaw 配置（原 config.json） |
| status | VARCHAR(16) | running/stopped/error |
| created_by | UUID FK → users | |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

#### workspace_files（工作空间文件表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID PK | |
| agent_id | UUID FK → agents | |
| tenant_id | UUID FK → tenants | 冗余，便于 RLS |
| filename | VARCHAR(64) | AGENT.md / SOUL.md / USER.md |
| content | TEXT | 文件内容 |
| updated_at | TIMESTAMP | |

#### chat_sessions（聊天会话表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID PK | 原 session_id |
| agent_id | UUID FK → agents | |
| tenant_id | UUID FK → tenants | |
| user_id | UUID FK → users | |
| title | VARCHAR(255) | 会话标题 |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

#### chat_messages（聊天消息表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID PK | |
| session_id | UUID FK → chat_sessions | |
| tenant_id | UUID FK → tenants | 冗余，便于 RLS |
| role | VARCHAR(16) | user/assistant/system |
| content | TEXT | 消息内容 |
| message_type | VARCHAR(32) | message.send/reasoning |
| created_at | TIMESTAMP | |

---

## 6. 认证与鉴权设计

### 6.1 认证方案：JWT + Refresh Token

```
登录流程：
  POST /api/v1/auth/login  →  Access Token (15min) + Refresh Token (7d)
  POST /api/v1/auth/refresh →  新 Access Token

Token 载荷：
  {
    "sub": "user_id",
    "tid": "current_tenant_id",   // 当前操作租户
    "role": "admin",
    "exp": ...
  }
```

选择 JWT 而非 Session 的理由：
- 无状态，适合未来水平扩展
- WebSocket 握手时可直接通过 query param 传递 token 验证

### 6.2 API 鉴权中间件链

```
请求 → CORS → AuthMiddleware → TenantMiddleware → RBACMiddleware → Handler
         ↑           ↑                ↑                  ↑
       跨域      验证 JWT        注入 tenant_id       检查角色权限
```

**AuthMiddleware**：
- 从 `Authorization: Bearer <token>` 提取并验证 JWT
- 将 user_id 注入 gin.Context

**TenantMiddleware**：
- 从 JWT 的 `tid` 字段或请求头 `X-Tenant-ID` 获取租户 ID
- 验证用户是否属于该租户
- 将 tenant_id 注入 gin.Context

**RBACMiddleware**（按路由配置）：
- owner：全部权限
- admin：管理 Agent、邀请成员
- member：使用 Agent、聊天

### 6.3 WebSocket 鉴权

```
ws://host/ws/chat/{agentName}?token=<jwt_access_token>

握手时验证：
1. 解析 JWT，提取 user_id + tenant_id
2. 查询 tenant_members 确认成员关系
3. 查询 agents 确认 Agent 属于该租户
4. 验证通过后升级连接，将 tenant_id/user_id 绑定到 WebSocket 连接
```

---

## 7. Row-Level Security (RLS) 加固

PostgreSQL RLS 作为第二道防线——即使应用层遗漏 tenant_id 过滤，数据库也拒绝跨租户数据。

```sql
-- 启用 RLS
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_files ENABLE ROW LEVEL SECURITY;

-- 策略：应用角色只能看到当前 tenant_id 的行
CREATE POLICY tenant_isolation ON agents
  USING (tenant_id = current_setting('app.current_tenant_id')::UUID);
```

应用层在每次请求开始时设置 PostgreSQL 会话变量：

```go
db.Exec("SET app.current_tenant_id = ?", tenantID)
```

---

## 8. GORM 租户隔离实现

### 8.1 自动注入 tenant_id 的 Scope

```go
func TenantScope(tenantID string) func(db *gorm.DB) *gorm.DB {
    return func(db *gorm.DB) *gorm.DB {
        if tenantID != "" {
            return db.Where("tenant_id = ?", tenantID)
        }
        return db
    }
}
```

### 8.2 GORM Callback 自动注入

在 Create/Update/Delete 的 Callback 中自动填充 tenant_id：

```go
db.Callback().Create().Before("gorm:create").Register("tenant:create", func(db *gorm.DB) {
    if tenantID, ok := db.Get("tenant_id"); ok {
        db.Statement.SetColumn("tenant_id", tenantID)
    }
})
```

### 8.3 全局 Scopes（防遗忘）

```go
// 在模型中注册默认 scope，确保所有查询都带 tenant_id
func (Agent) defaultScopes() []func(*gorm.DB) *gorm.DB {
    return []func(*gorm.DB) *gorm.DB{
        func(db *gorm.DB) *gorm.DB {
            if tid, ok := db.Get("tenant_id"); ok {
                return db.Where("tenant_id = ?", tid)
            }
            return db
        },
    }
}
```

---

## 9. Agent 运行时隔离

当前 Agent 运行时依赖文件系统：

```
~/.finclaw/<agentName>/config.json
~/.finclaw/<agentName>/workspace/AGENT.md
~/.finclaw/<agentName>/workspace/SOUL.md
~/.finclaw/<agentName>/workspace/USER.md
```

### 方案：租户前缀目录 + 数据库为主存储

```
~/.finclaw/<tenantSlug>_<agentName>/config.json   ← 运行时文件
~/.finclaw/<tenantSlug>_<agentName>/workspace/...

实际数据存储在数据库，文件系统仅作为 PicoClaw 运行时的"投影"：
1. Agent 创建/更新 → 写数据库 + 同步投影到文件系统
2. Agent 启动 → 从数据库读取 → 写入投影目录 → 启动 PicoClaw
3. 运行时 persona 文件修改 → 写数据库 + 同步回投影文件
```

这样：
- Agent 运行时对 PicoClaw 零侵入，仍读本地文件
- 数据权威源在数据库，文件系统是可重建的缓存
- 不同租户 Agent 天然隔离在不同目录

### AgentManager 改造

```go
// 改造前：全局一个 AgentManager，所有 Agent 平铺
agentManager.AddAgent(name, config)

// 改造后：按租户隔离，Agent key 变为 tenantSlug:agentName
agentManager.AddAgent(tenantSlug+":"+name, config)
// 内部目录映射：~/.finclaw/<tenantSlug>_<agentName>/
```

---

## 10. API 改造

### 10.1 新增路由

```
# 认证
POST   /api/v1/auth/register         注册
POST   /api/v1/auth/login            登录
POST   /api/v1/auth/refresh          刷新 Token
POST   /api/v1/auth/logout           登出

# 租户管理
POST   /api/v1/tenants               创建租户
GET    /api/v1/tenants               我的租户列表
GET    /api/v1/tenants/:tid          租户详情
PUT    /api/v1/tenants/:tid          更新租户
DELETE /api/v1/tenants/:tid          删除租户（owner only）

# 租户成员
GET    /api/v1/tenants/:tid/members       成员列表
POST   /api/v1/tenants/:tid/members/invite  邀请成员
PUT    /api/v1/tenants/:tid/members/:uid   更新角色
DELETE /api/v1/tenants/:tid/members/:uid   移除成员
```

### 10.2 改造现有路由

所有 `/agents` 路由改为 `/api/v1/tenants/:tid/agents`，并加鉴权：

```
# 改造前                        # 改造后
GET    /agents             →     GET    /api/v1/tenants/:tid/agents
POST   /agents             →     POST   /api/v1/tenants/:tid/agents
GET    /agents/:name       →     GET    /api/v1/tenants/:tid/agents/:name
PUT    /agents/:name       →     PUT    /api/v1/tenants/:tid/agents/:name
DELETE /agents/:name       →     DELETE /api/v1/tenants/:tid/agents/:name
...（子资源同理）

# WebSocket
GET /ws/chat/:agentName   →     GET /ws/chat/:agentName?token=xxx&tenant_id=xxx

# RSS（按需决定是否租户化，初期可暂缓）
GET /rss/index             →     GET /api/v1/tenants/:tid/rss/index
```

### 10.3 兼容策略

为平滑过渡，可保留旧路由作为内部 API（无鉴权），仅供开发/自托管使用。生产环境通过中间件强制鉴权。

---

## 11. 前端改造

### 11.1 新增页面

| 页面 | 路由 | 说明 |
|------|------|------|
| 登录页 | `/login` | 邮箱+密码登录 |
| 注册页 | `/register` | 邮箱+密码注册 |
| 租户列表 | `/tenants` | 选择/切换/创建租户 |
| 租户设置 | `/tenants/:tid/settings` | 成员管理、租户信息 |
| 邀请接受 | `/invite/:code` | 接受租户邀请 |

### 11.2 认证状态管理

```
AuthProvider
  ├── 存储 access_token / refresh_token
  ├── 自动刷新 Token（axios 拦截器）
  ├── 路由守卫：未登录跳 /login
  └── 提供 currentUser / currentTenant 上下文
```

### 11.3 租户切换

```
TenantProvider
  ├── 当前租户状态（存在 localStorage）
  ├── 切换租户 → 更新 JWT tid → 刷新页面数据
  └── API 请求自动带 X-Tenant-ID header
```

### 11.4 聊天记录持久化改造

```
改造前：localStorage 按 agentName 存储
改造后：
  - 聊天记录存数据库（通过 API）
  - localStorage 仅做离线缓存
  - 切换设备/浏览器可恢复历史
```

---

## 12. 文件结构调整（新增）

```
internal/
├── config/          # 现有，增加 DB 配置
├── router/
│   ├── router.go    # 改造：路由分组 + 鉴权中间件
│   ├── middle.go    # 改造：增加 Auth/Tenant/RBAC 中间件
│   └── router_ws.go # 改造：WebSocket 握手鉴权
├── model/           # 新增：GORM 模型
│   ├── tenant.go
│   ├── user.go
│   ├── tenant_member.go
│   ├── agent.go
│   ├── workspace_file.go
│   ├── chat_session.go
│   └── chat_message.go
├── handler/         # 新增：HTTP Handler
│   ├── auth.go
│   ├── tenant.go
│   ├── member.go
│   └── agent.go     # 改造：从 pkg/agent/router.go 逻辑迁移
├── service/         # 新增：业务逻辑层
│   ├── auth.go
│   ├── tenant.go
│   ├── agent.go
│   └── chat.go
├── repository/      # 新增：数据访问层
│   ├── tenant.go
│   ├── user.go
│   ├── agent.go
│   └── chat.go
├── middleware/       # 新增：从 router/middle.go 拆分
│   ├── auth.go
│   ├── tenant.go
│   └── rbac.go
├── database/        # 新增：数据库初始化 + 迁移
│   ├── postgres.go
│   └── migrations/
└── rss/             # 现有

pkg/
├── agent/
│   ├── agentmanager.go  # 改造：支持 tenant 前缀
│   └── ...
├── channels/finclaw/
│   ├── conn.go          # 改造：绑定 tenant_id/user_id
│   ├── finclaw.go       # 改造：租户消息隔离
│   └── proto.go         # 现有
└── ...
```

---

## 13. 关键技术决策汇总

| 决策点 | 选择 | 理由 |
|--------|------|------|
| 数据库 | PostgreSQL | RLS 原生支持，JSONB，成熟生态 |
| ORM | GORM | Go 生态首选，Callback 支持 tenant 注入 |
| 认证 | JWT (Access + Refresh) | 无状态，适合 WebSocket + 水平扩展 |
| 隔离方案 | 共享库 + tenant_id + RLS | 实现成本与隔离强度平衡 |
| Agent 运行时 | 数据库为主 + 文件系统投影 | 零侵入 PicoClaw，数据权威源统一 |
| 密码存储 | bcrypt | 业界标准 |
| API 版本 | /api/v1/ | 前后端分离，便于演进 |

---

## 14. 分阶段实施计划

### Phase 1：基础设施（预计 3-4 天）

- [ ] 引入 PostgreSQL + GORM，初始化连接池
- [ ] 创建所有数据模型，编写 AutoMigrate
- [ ] 实现 RLS 策略
- [ ] 实现 JWT 签发/验证工具函数
- [ ] 实现 bcrypt 密码哈希

### Phase 2：认证体系（预计 2-3 天）

- [ ] 注册/登录/刷新 Token API
- [ ] AuthMiddleware
- [ ] 前端登录/注册页面
- [ ] 前端 AuthProvider + Token 管理 + 路由守卫

### Phase 3：租户管理（预计 2-3 天）

- [ ] 租户 CRUD API
- [ ] TenantMiddleware + RLS 会话变量注入
- [ ] 成员邀请/角色管理 API
- [ ] RBACMiddleware
- [ ] 前端租户列表/切换/设置页面

### Phase 4：Agent 租户化（预计 3-4 天）

- [ ] Agent 表 + tenant_id，CRUD API 改造
- [ ] AgentManager 改造：tenant 前缀 + 文件投影
- [ ] workspace_files 表，persona 文件数据库存储
- [ ] 现有 /agents 路由迁移到 /api/v1/tenants/:tid/agents
- [ ] 前端 Agent 管理页面适配

### Phase 5：聊天租户化（预计 2-3 天）

- [ ] chat_sessions + chat_messages 表
- [ ] 聊天记录 API（历史查询/删除）
- [ ] WebSocket 握手鉴权 + tenant_id 绑定
- [ ] 消息路由租户隔离
- [ ] 前端聊天记录从 localStorage 迁移到 API

### Phase 6：加固与测试（预计 2-3 天）

- [ ] 隔离性测试（跨租户数据不可见）
- [ ] RBAC 权限测试
- [ ] WebSocket 安全测试
- [ ] 性能基准测试
- [ ] API 文档更新

**总预估：14-20 个工作日**

---

## 15. 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| PicoClaw 运行时与文件系统耦合 | Agent 启动/停止需同步两份数据 | 投影策略 + 启动时校验一致性 |
| RLS 配置遗漏导致数据泄露 | 隔离失效 | CI 中加入 RLS 测试用例，每张表必须有 RLS 策略 |
| JWT 无状态导致角色变更延迟 | 用户被移除后 Token 仍有权限 | Access Token 短有效期(15min) + 关键操作实时校验 |
| 迁移过程影响自托管用户 | 旧 API 失效 | 保留无鉴权模式（配置开关），自托管可关闭租户 |
| GORM 全局 Scope 遗漏 | 某些查询未带 tenant_id | RLS 作为兜底 + Code Review 检查清单 |
