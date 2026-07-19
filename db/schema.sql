-- =========================================================
-- ESQUEMA GENERICO: sirve para Chiper y para CUALQUIER juego futuro
-- =========================================================

-- Catálogo de juegos disponibles en la plataforma
create table games (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,          -- ej: 'chiper-caminos'
  name text not null,                 -- ej: 'Chiper: El Camino Correcto'
  description text,
  created_at timestamptz default now()
);

-- Contenido editable de cada juego (personaje, preguntas, caminos, pantallas)
-- Esto es lo que TU editor va a modificar, sin tocar código
create table game_configs (
  id uuid primary key default gen_random_uuid(),
  game_id uuid references games(id) on delete cascade,
  version int not null default 1,
  content jsonb not null,             -- aquí vive toda la estructura editable
  is_active boolean default true,
  created_at timestamptz default now()
);

-- Una "partida en vivo" (una sesión de tu reunión de Zoom)
create table sessions (
  id uuid primary key default gen_random_uuid(),
  game_id uuid references games(id),
  room_code text unique not null,     -- código corto que ven tus participantes, ej: "AB12"
  mode text not null check (mode in ('group','individual')),
  status text not null default 'lobby' check (status in ('lobby','playing','finished')),
  current_step text,                  -- en qué pregunta/paso va (modo grupal)
  host_token text not null,           -- clave secreta para que solo tú controles el presentador
  created_at timestamptz default now()
);

-- Participantes que se conectan desde su celular/PC
create table participants (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions(id) on delete cascade,
  name text not null,
  joined_at timestamptz default now()
);

-- Cada decisión/voto que toma un participante
create table choices (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions(id) on delete cascade,
  participant_id uuid references participants(id) on delete cascade,
  step_id text not null,              -- identifica la pregunta dentro del config
  path_id text not null,              -- qué camino eligió (ej: 'a', 'b', 'c')
  is_correct boolean,
  created_at timestamptz default now()
);

-- Índices para que las estadísticas en tiempo real sean rápidas
create index idx_choices_session_step on choices(session_id, step_id);
create index idx_participants_session on participants(session_id);

-- Habilitar tiempo real (para que el dashboard y el presentador se actualicen solos)
alter publication supabase_realtime add table choices;
alter publication supabase_realtime add table participants;
alter publication supabase_realtime add table sessions;
