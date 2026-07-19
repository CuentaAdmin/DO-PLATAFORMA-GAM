-- =========================================================
-- MIGRACIÓN 2: usuarios (login del editor) + imágenes de juegos
-- =========================================================

create table admin_users (
  id uuid primary key default gen_random_uuid(),
  username text unique not null,
  password_hash text not null,
  created_at timestamptz default now()
);

create table game_images (
  id uuid primary key default gen_random_uuid(),
  game_id uuid references games(id) on delete cascade,
  filename text,
  mime_type text not null,
  data_base64 text not null,
  created_at timestamptz default now()
);

create index idx_game_images_game on game_images(game_id);
