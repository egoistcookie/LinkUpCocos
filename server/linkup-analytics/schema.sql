-- 青庭两两 / LinkUp 游戏埋点（独立库，对标塔防 tower_defense_analytics）
-- JDBC 示例：
-- jdbc:mysql://120.77.92.36:3306/linkup_analytics?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=UTC
--
-- 部署（需有建库权限的账号）：
--   mysql -uUSER -p < schema.sql
-- 或远程：
--   mysql -h120.77.92.36 -uUSER -p < schema.sql

CREATE DATABASE IF NOT EXISTS linkup_analytics
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE linkup_analytics;

CREATE TABLE IF NOT EXISTS linkup_level_session (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
    session_id      VARCHAR(64)     NOT NULL COMMENT '客户端会话ID，开始写入、结束更新同一条',
    player_id       VARCHAR(64)     NOT NULL COMMENT '玩家ID（本地生成UUID，后续可换成openId）',
    level_no        INT UNSIGNED    NOT NULL COMMENT '关卡数',
    status          VARCHAR(16)     NOT NULL DEFAULT 'playing' COMMENT 'playing/win/abort/fail',
    start_time      DATETIME(3)     NOT NULL COMMENT '开局时间',
    end_time        DATETIME(3)     NULL COMMENT '过关或失败/退出时间',
    duration_ms     INT UNSIGNED    NULL COMMENT '本关耗时（毫秒）',
    connect_count   INT UNSIGNED    NULL COMMENT '连线次数',
    coins_earned    INT             NULL COMMENT '本关获得金币',
    props_used      JSON            NULL COMMENT '道具使用情况 JSON，如 {"hint":1,"refresh":0,"eliminate":2}',
    extra           JSON            NULL COMMENT '扩展信息 JSON（卡组、平台等）',
    created_at      DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at      DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uk_session_id (session_id),
    KEY idx_player_start (player_id, start_time),
    KEY idx_level_status (level_no, status),
    KEY idx_end_time (end_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='关卡对局埋点：开始新增，结束更新';

CREATE TABLE IF NOT EXISTS linkup_event_log (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
    player_id       VARCHAR(64)     NOT NULL COMMENT '玩家ID',
    event_type      VARCHAR(32)     NOT NULL COMMENT '事件类型：buy_block/buy_prop/deck_config 等',
    event_time      DATETIME(3)     NOT NULL COMMENT '事件时间',
    payload         JSON            NULL COMMENT '事件详情 JSON',
    created_at      DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    KEY idx_player_time (player_id, event_time),
    KEY idx_type_time (event_type, event_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='非对局类埋点：购买方块、配置卡组等';
