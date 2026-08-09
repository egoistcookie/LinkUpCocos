#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""LinkUp / 青庭两两 埋点 API：开始写入、结束更新、购买/卡组事件。"""

import json
import os
import traceback
from datetime import datetime
from typing import Any, Dict, Optional

import pymysql
from flask import Flask, jsonify, request

app = Flask(__name__)

ALLOWED_RESULTS = frozenset({"win", "abort", "fail"})
ALLOWED_EVENTS = frozenset({"buy_block", "buy_prop", "deck_config"})


def _load_config() -> Dict[str, Any]:
    cfg_path = os.environ.get(
        "LINKUP_ANALYTICS_CONFIG",
        os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.json"),
    )
    with open(cfg_path, "r", encoding="utf-8") as f:
        return json.load(f)


def _db():
    cfg = _load_config()["mysql"]
    return pymysql.connect(
        host=cfg.get("host", "127.0.0.1"),
        port=int(cfg.get("port", 3306)),
        user=cfg["user"],
        password=cfg["password"],
        database=cfg["database"],
        charset=cfg.get("charset", "utf8mb4"),
        cursorclass=pymysql.cursors.DictCursor,
        autocommit=True,
    )


def _now_str() -> str:
    # DATETIME(3)
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]


def _json_dumps(value: Any) -> Optional[str]:
    if value is None:
        return None
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def _ok(data=None, code=0, msg="ok"):
    body = {"code": code, "msg": msg}
    if data is not None:
        body["data"] = data
    return jsonify(body)


def _err(msg, http_status=400, code=1):
    return jsonify({"code": code, "msg": msg}), http_status


def _cors(resp):
    resp.headers["Access-Control-Allow-Origin"] = "*"
    resp.headers["Access-Control-Allow-Methods"] = "GET,POST,OPTIONS"
    resp.headers["Access-Control-Allow-Headers"] = "Content-Type"
    return resp


@app.after_request
def after_request(resp):
    return _cors(resp)


@app.route("/api/linkup/health", methods=["GET", "OPTIONS"])
def health():
    if request.method == "OPTIONS":
        return _ok()
    data = {"service": "linkup-analytics"}
    # ?db=1 时顺便测数据库
    if request.args.get("db") == "1":
        conn = None
        try:
            conn = _db()
            with conn.cursor() as cur:
                cur.execute("SELECT 1 AS ok")
                row = cur.fetchone()
            data["db"] = "ok"
            data["ping"] = row
        except Exception as e:
            traceback.print_exc()
            return _err("db error: %s" % e, http_status=500, code=2)
        finally:
            if conn is not None:
                conn.close()
    return _ok(data)


@app.route("/api/linkup/level/start", methods=["POST", "OPTIONS"])
def level_start():
    if request.method == "OPTIONS":
        return _ok()
    body = request.get_json(silent=True) or {}
    session_id = str(body.get("session_id") or "").strip()
    player_id = str(body.get("player_id") or "").strip()
    level_no = body.get("level")
    extra = body.get("extra")
    if not session_id or not player_id:
        return _err("session_id/player_id required")
    try:
        level_no = int(level_no)
    except (TypeError, ValueError):
        return _err("level must be int")
    if level_no < 1:
        return _err("level must be >= 1")

    now = _now_str()
    extra_s = _json_dumps(extra)
    conn = None
    try:
        conn = _db()
        with conn.cursor() as cur:
            # JSON 列直接传字符串，兼容性好过 CAST(%s AS JSON)
            cur.execute(
                """
                INSERT INTO linkup_level_session
                    (session_id, player_id, level_no, status, start_time, extra)
                VALUES
                    (%s, %s, %s, 'playing', %s, %s)
                ON DUPLICATE KEY UPDATE
                    player_id = %s,
                    level_no = %s,
                    status = 'playing',
                    start_time = %s,
                    end_time = NULL,
                    duration_ms = NULL,
                    connect_count = NULL,
                    coins_earned = NULL,
                    props_used = NULL,
                    extra = %s
                """,
                (
                    session_id,
                    player_id,
                    level_no,
                    now,
                    extra_s,
                    player_id,
                    level_no,
                    now,
                    extra_s,
                ),
            )
        return _ok({"session_id": session_id})
    except Exception as e:
        traceback.print_exc()
        return _err("db error: %s" % e, http_status=500, code=2)
    finally:
        if conn is not None:
            conn.close()


@app.route("/api/linkup/level/end", methods=["POST", "OPTIONS"])
def level_end():
    if request.method == "OPTIONS":
        return _ok()
    body = request.get_json(silent=True) or {}
    session_id = str(body.get("session_id") or "").strip()
    player_id = str(body.get("player_id") or "").strip()
    result = str(body.get("result") or "").strip().lower()
    if not session_id:
        return _err("session_id required")
    if result not in ALLOWED_RESULTS:
        return _err("result must be win/abort/fail")

    def _opt_int(v):
        if v is None or v == "":
            return None
        try:
            return int(v)
        except (TypeError, ValueError):
            return None

    now = _now_str()
    duration_ms = _opt_int(body.get("duration_ms"))
    connect_count = _opt_int(body.get("connect_count"))
    coins_earned = _opt_int(body.get("coins_earned"))
    props_s = _json_dumps(body.get("props_used"))
    extra_s = _json_dumps(body.get("extra"))

    conn = None
    try:
        conn = _db()
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE linkup_level_session
                SET status = %s,
                    end_time = %s,
                    duration_ms = COALESCE(%s, duration_ms),
                    connect_count = COALESCE(%s, connect_count),
                    coins_earned = COALESCE(%s, coins_earned),
                    props_used = COALESCE(%s, props_used),
                    extra = COALESCE(%s, extra),
                    player_id = IF(%s = '', player_id, %s)
                WHERE session_id = %s
                """,
                (
                    result,
                    now,
                    duration_ms,
                    connect_count,
                    coins_earned,
                    props_s,
                    extra_s,
                    player_id,
                    player_id,
                    session_id,
                ),
            )
            affected = cur.rowcount
        if affected <= 0:
            return _err("session not found", http_status=404, code=3)
        return _ok({"session_id": session_id, "status": result})
    except Exception as e:
        traceback.print_exc()
        return _err("db error: %s" % e, http_status=500, code=2)
    finally:
        if conn is not None:
            conn.close()


@app.route("/api/linkup/event", methods=["POST", "OPTIONS"])
def event_log():
    if request.method == "OPTIONS":
        return _ok()
    body = request.get_json(silent=True) or {}
    player_id = str(body.get("player_id") or "").strip()
    event_type = str(body.get("event_type") or "").strip()
    payload = body.get("payload")
    if not player_id:
        return _err("player_id required")
    if event_type not in ALLOWED_EVENTS:
        return _err("unsupported event_type")

    now = _now_str()
    conn = None
    try:
        conn = _db()
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO linkup_event_log (player_id, event_type, event_time, payload)
                VALUES (%s, %s, %s, %s)
                """,
                (player_id, event_type, now, _json_dumps(payload)),
            )
            event_id = cur.lastrowid
        return _ok({"id": event_id})
    except Exception as e:
        traceback.print_exc()
        return _err("db error: %s" % e, http_status=500, code=2)
    finally:
        if conn is not None:
            conn.close()


def main():
    cfg = _load_config()
    host = cfg.get("host", "127.0.0.1")
    port = int(cfg.get("port", 8765))
    app.run(host=host, port=port, threaded=True)


if __name__ == "__main__":
    main()
