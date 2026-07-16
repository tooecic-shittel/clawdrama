import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema.js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_PATH = process.env.DB_PATH || path.resolve(__dirname, '../../../data/huobao_drama.db')

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true })

const sqlite = new Database(DB_PATH, { timeout: 30000 })
sqlite.pragma('journal_mode = WAL')
sqlite.pragma('busy_timeout = 30000')

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    email TEXT,
    password_hash TEXT NOT NULL,
    display_name TEXT,
    role TEXT NOT NULL DEFAULT 'user',
    credits INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS credit_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    amount INTEGER NOT NULL,
    balance_after INTEGER NOT NULL,
    type TEXT NOT NULL,
    description TEXT,
    reference_type TEXT,
    reference_id INTEGER,
    meta TEXT,
    operator_id INTEGER,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_credit_tx_user_created ON credit_transactions (user_id, created_at DESC);

  CREATE TABLE IF NOT EXISTS learning_code_batches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_no TEXT NOT NULL UNIQUE,
    course_id TEXT NOT NULL,
    channel TEXT NOT NULL,
    sku TEXT NOT NULL,
    campaign TEXT,
    partner_name TEXT,
    quantity INTEGER NOT NULL,
    included_credits INTEGER NOT NULL,
    expires_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    created_by INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_learning_batches_batch_no ON learning_code_batches (batch_no);

  CREATE TABLE IF NOT EXISTS learning_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_id INTEGER NOT NULL,
    code_hash TEXT NOT NULL UNIQUE,
    code_suffix TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'unused',
    redeemed_by INTEGER,
    redeemed_at TEXT,
    disabled_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_learning_codes_hash ON learning_codes (code_hash);
  CREATE INDEX IF NOT EXISTS idx_learning_codes_batch ON learning_codes (batch_id, status);

  CREATE TABLE IF NOT EXISTS learning_entitlements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    course_id TEXT NOT NULL,
    source_code_id INTEGER,
    status TEXT NOT NULL DEFAULT 'active',
    granted_by INTEGER,
    granted_at TEXT NOT NULL,
    revoked_at TEXT,
    updated_at TEXT NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_learning_entitlements_user_course ON learning_entitlements (user_id, course_id);

  CREATE TABLE IF NOT EXISTS learning_progress (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    course_id TEXT NOT NULL,
    lesson_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'in_progress',
    last_position_sec INTEGER NOT NULL DEFAULT 0,
    completed_at TEXT,
    updated_at TEXT NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_learning_progress_user_lesson ON learning_progress (user_id, course_id, lesson_id);

  CREATE TABLE IF NOT EXISTS invite_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    note TEXT,
    max_uses INTEGER NOT NULL DEFAULT 1,
    used_count INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_by INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_invite_codes_code ON invite_codes (code);

  CREATE TABLE IF NOT EXISTS payment_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_no TEXT NOT NULL UNIQUE,
    user_id INTEGER NOT NULL,
    package_id TEXT NOT NULL,
    package_name TEXT NOT NULL,
    credits INTEGER NOT NULL,
    amount_cents INTEGER NOT NULL,
    currency TEXT NOT NULL DEFAULT 'CNY',
    provider TEXT NOT NULL DEFAULT 'alipay',
    provider_trade_no TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    pay_url TEXT,
    paid_at TEXT,
    raw_notify TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_orders_order_no ON payment_orders (order_no);
  CREATE INDEX IF NOT EXISTS idx_payment_orders_user_created ON payment_orders (user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_payment_orders_status ON payment_orders (status);

  CREATE TABLE IF NOT EXISTS dramas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    title TEXT NOT NULL,
    description TEXT,
    genre TEXT,
    style TEXT DEFAULT 'realistic',
    total_episodes INTEGER DEFAULT 1,
    total_duration INTEGER DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'draft',
    thumbnail TEXT,
    tags TEXT,
    metadata TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );

  CREATE TABLE IF NOT EXISTS episodes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    drama_id INTEGER NOT NULL,
    episode_number INTEGER NOT NULL,
    title TEXT NOT NULL,
    content TEXT,
    script_content TEXT,
    description TEXT,
    duration INTEGER DEFAULT 0,
    status TEXT DEFAULT 'draft',
    video_url TEXT,
    bgm_url TEXT,
    thumbnail TEXT,
    image_config_id INTEGER,
    video_config_id INTEGER,
    audio_config_id INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );

  CREATE TABLE IF NOT EXISTS characters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    drama_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    role TEXT,
    description TEXT,
    appearance TEXT,
    personality TEXT,
    voice_style TEXT,
    image_url TEXT,
    reference_images TEXT,
    seed_value TEXT,
    sort_order INTEGER,
    local_path TEXT,
    voice_sample_url TEXT,
    voice_provider TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );

  CREATE TABLE IF NOT EXISTS scenes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    drama_id INTEGER NOT NULL,
    episode_id INTEGER,
    location TEXT NOT NULL,
    time TEXT NOT NULL,
    prompt TEXT NOT NULL,
    storyboard_count INTEGER DEFAULT 1,
    image_url TEXT,
    status TEXT DEFAULT 'pending',
    local_path TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );

  CREATE TABLE IF NOT EXISTS storyboards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    episode_id INTEGER NOT NULL,
    scene_id INTEGER,
    storyboard_number INTEGER NOT NULL,
    title TEXT,
    location TEXT,
    time TEXT,
    shot_type TEXT,
    angle TEXT,
    movement TEXT,
    lighting TEXT,
    composition TEXT,
    emotion_beat TEXT,
    action TEXT,
    result TEXT,
    atmosphere TEXT,
    image_prompt TEXT,
    video_prompt TEXT,
    bgm_prompt TEXT,
    sound_effect TEXT,
    dialogue TEXT,
    description TEXT,
    duration INTEGER DEFAULT 0,
    composed_image TEXT,
    first_frame_image TEXT,
    last_frame_image TEXT,
    reference_images TEXT,
    video_url TEXT,
    tts_audio_url TEXT,
    subtitle_url TEXT,
    composed_video_url TEXT,
    status TEXT DEFAULT 'pending',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );

  CREATE TABLE IF NOT EXISTS episode_characters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    episode_id INTEGER NOT NULL,
    character_id INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_episode_characters_episode_id
    ON episode_characters (episode_id);
  CREATE INDEX IF NOT EXISTS idx_episode_characters_character_id
    ON episode_characters (character_id);

  CREATE TABLE IF NOT EXISTS episode_scenes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    episode_id INTEGER NOT NULL,
    scene_id INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_episode_scenes_episode_id
    ON episode_scenes (episode_id);
  CREATE INDEX IF NOT EXISTS idx_episode_scenes_scene_id
    ON episode_scenes (scene_id);

  CREATE TABLE IF NOT EXISTS storyboard_characters (
    storyboard_id INTEGER NOT NULL,
    character_id INTEGER NOT NULL,
    PRIMARY KEY (storyboard_id, character_id)
  );
  CREATE INDEX IF NOT EXISTS idx_storyboard_characters_storyboard_id
    ON storyboard_characters (storyboard_id);
  CREATE INDEX IF NOT EXISTS idx_storyboard_characters_character_id
    ON storyboard_characters (character_id);

  CREATE TABLE IF NOT EXISTS ai_service_configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    service_type TEXT NOT NULL,
    provider TEXT,
    name TEXT NOT NULL,
    base_url TEXT NOT NULL,
    api_key TEXT NOT NULL,
    model TEXT,
    endpoint TEXT,
    query_endpoint TEXT,
    priority INTEGER DEFAULT 0,
    is_default INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    settings TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS ai_service_providers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    display_name TEXT,
    service_type TEXT NOT NULL,
    provider TEXT NOT NULL,
    default_url TEXT,
    preset_models TEXT,
    description TEXT,
    is_active INTEGER DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS ai_voices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    voice_id TEXT NOT NULL UNIQUE,
    voice_name TEXT NOT NULL,
    description TEXT,
    language TEXT,
    provider TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS agent_configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_type TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    model TEXT,
    system_prompt TEXT,
    temperature REAL,
    max_tokens INTEGER,
    max_iterations INTEGER,
    is_active INTEGER DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );

  CREATE TABLE IF NOT EXISTS image_generations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    storyboard_id INTEGER,
    drama_id INTEGER,
    scene_id INTEGER,
    character_id INTEGER,
    prop_id INTEGER,
    image_type TEXT,
    frame_type TEXT,
    provider TEXT,
    prompt TEXT,
    negative_prompt TEXT,
    model TEXT,
    size TEXT,
    quality TEXT,
    style TEXT,
    steps INTEGER,
    cfg_scale REAL,
    seed INTEGER,
    image_url TEXT,
    minio_url TEXT,
    local_path TEXT,
    status TEXT DEFAULT 'pending',
    task_id TEXT,
    error_msg TEXT,
    width INTEGER,
    height INTEGER,
    reference_images TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    completed_at TEXT
  );

  CREATE TABLE IF NOT EXISTS video_generations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    storyboard_id INTEGER,
    drama_id INTEGER,
    provider TEXT,
    prompt TEXT,
    model TEXT,
    image_gen_id INTEGER,
    reference_mode TEXT,
    image_url TEXT,
    first_frame_url TEXT,
    last_frame_url TEXT,
    reference_image_urls TEXT,
    duration INTEGER,
    fps INTEGER,
    resolution TEXT,
    aspect_ratio TEXT,
    style TEXT,
    motion_level INTEGER,
    camera_motion TEXT,
    seed INTEGER,
    video_url TEXT,
    minio_url TEXT,
    local_path TEXT,
    status TEXT DEFAULT 'pending',
    task_id TEXT,
    error_msg TEXT,
    width INTEGER,
    height INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    completed_at TEXT,
    deleted_at TEXT
  );

  CREATE TABLE IF NOT EXISTS video_merges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    episode_id INTEGER,
    drama_id INTEGER,
    title TEXT,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    scenes TEXT,
    merged_url TEXT,
    duration INTEGER,
    task_id TEXT,
    error_msg TEXT,
    created_at TEXT NOT NULL,
    completed_at TEXT,
    deleted_at TEXT
  );

  CREATE TABLE IF NOT EXISTS props (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    drama_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    type TEXT,
    description TEXT,
    prompt TEXT,
    image_url TEXT,
    reference_images TEXT,
    local_path TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );

  CREATE TABLE IF NOT EXISTS assets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    drama_id INTEGER,
    episode_id INTEGER,
    storyboard_id INTEGER,
    storyboard_num INTEGER,
    name TEXT,
    description TEXT,
    type TEXT,
    category TEXT,
    url TEXT,
    thumbnail_url TEXT,
    local_path TEXT,
    file_size INTEGER,
    mime_type TEXT,
    width INTEGER,
    height INTEGER,
    duration INTEGER,
    format TEXT,
    image_gen_id INTEGER,
    video_gen_id INTEGER,
    is_favorite INTEGER DEFAULT 0,
    view_count INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );
`)

function ensureColumn(table: string, column: string, definition: string) {
  const tableExists = sqlite.prepare(
    `SELECT 1 as ok FROM sqlite_master WHERE type='table' AND name=? LIMIT 1`,
  ).get(table) as { ok: number } | undefined
  if (!tableExists) return
  const columns = sqlite.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  if (!columns.some(col => col.name === column)) {
    sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
  }
}

ensureColumn('episodes', 'image_config_id', 'INTEGER')
ensureColumn('episodes', 'video_config_id', 'INTEGER')
ensureColumn('episodes', 'audio_config_id', 'INTEGER')
ensureColumn('episodes', 'bgm_url', 'TEXT')
ensureColumn('storyboards', 'lighting', 'TEXT')
ensureColumn('storyboards', 'composition', 'TEXT')
ensureColumn('storyboards', 'emotion_beat', 'TEXT')
ensureColumn('users', 'credits', 'INTEGER NOT NULL DEFAULT 0')
ensureColumn('characters', 'view_side', 'TEXT')
ensureColumn('characters', 'view_back', 'TEXT')
ensureColumn('characters', 'image_prompt', 'TEXT')
ensureColumn('image_generations', 'user_id', 'INTEGER')
ensureColumn('video_generations', 'user_id', 'INTEGER')
ensureColumn('dramas', 'user_id', 'INTEGER')  // 多租户：剧集属主（旧数据 null）
ensureColumn('users', 'invite_code', 'TEXT')   // 邀请注册：记录注册用码（旧用户 null）
ensureColumn('users', 'referral_code', 'TEXT') // 本人专属邀请码（懒生成）
ensureColumn('users', 'disabled', 'INTEGER NOT NULL DEFAULT 0') // 用户管理：禁用账号
ensureColumn('storyboards', 'first_frame_prompt', 'TEXT') // 首帧自定义提示词（持久化，重开弹窗/重新生成时复用）
ensureColumn('storyboards', 'last_frame_prompt', 'TEXT')  // 尾帧自定义提示词
sqlite.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_referral_code ON users (referral_code)`)

export const db = drizzle(sqlite, { schema })
export { schema }
export type DB = typeof db
