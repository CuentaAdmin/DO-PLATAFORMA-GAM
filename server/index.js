require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const { Pool } = require('pg');
const { nanoid } = require('nanoid');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' })); // 5mb por si algún día mandamos imágenes en base64

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// Conexión a Neon (Postgres). DATABASE_URL viene de las variables de entorno en Render.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// ------------------------------------------------------------------
// Utilidad: generar un código de sala corto y fácil de leer en pantalla
// ------------------------------------------------------------------
function generarCodigoSala() {
  const alfabeto = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // sin caracteres confusos (O/0, I/1)
  let codigo = '';
  for (let i = 0; i < 5; i++) {
    codigo += alfabeto[Math.floor(Math.random() * alfabeto.length)];
  }
  return codigo;
}

// ------------------------------------------------------------------
// Salud del servicio (para que el ping automático lo mantenga despierto)
// ------------------------------------------------------------------
app.get('/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// ------------------------------------------------------------------
// AUTENTICACIÓN — solo para el editor de contenido
// ------------------------------------------------------------------
const JWT_SECRET = process.env.JWT_SECRET;

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'No autorizado' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido o vencido' });
  }
}

// Crear el PRIMER usuario admin. Solo funciona si todavía no existe ningún usuario,
// y requiere un secreto que solo tú conoces (variable de entorno ADMIN_BOOTSTRAP_SECRET).
app.post('/api/auth/bootstrap', async (req, res) => {
  try {
    const { secret, username, password } = req.body;
    if (!secret || secret !== process.env.ADMIN_BOOTSTRAP_SECRET) {
      return res.status(403).json({ error: 'Secreto inválido' });
    }
    const existentes = await pool.query('select count(*)::int as total from admin_users');
    if (existentes.rows[0].total > 0) {
      return res.status(400).json({ error: 'Ya existe un usuario administrador. Usa /api/auth/register (con sesión) para agregar más.' });
    }
    if (!username || !password || password.length < 6) {
      return res.status(400).json({ error: 'username y password (mínimo 6 caracteres) son requeridos' });
    }
    const hash = await bcrypt.hash(password, 10);
    await pool.query('insert into admin_users (username, password_hash) values ($1, $2)', [username, hash]);
    res.json({ ok: true, message: 'Usuario administrador creado. Ya puedes iniciar sesión.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error creando el usuario administrador' });
  }
});

// Agregar un nuevo usuario del equipo (requiere ya estar logueado)
app.post('/api/auth/register', requireAuth, async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password || password.length < 6) {
      return res.status(400).json({ error: 'username y password (mínimo 6 caracteres) son requeridos' });
    }
    const hash = await bcrypt.hash(password, 10);
    await pool.query('insert into admin_users (username, password_hash) values ($1, $2)', [username, hash]);
    res.json({ ok: true });
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Ese usuario ya existe' });
    console.error(err);
    res.status(500).json({ error: 'Error creando el usuario' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'username y password son requeridos' });

    const result = await pool.query('select id, username, password_hash from admin_users where username = $1', [username]);
    if (result.rowCount === 0) return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });

    const user = result.rows[0];
    const valido = await bcrypt.compare(password, user.password_hash);
    if (!valido) return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });

    const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, username: user.username });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error iniciando sesión' });
  }
});

// ------------------------------------------------------------------
// EDITOR — crear/editar juegos y su contenido (protegido, requiere login)
// ------------------------------------------------------------------
app.get('/api/admin/games', requireAuth, async (req, res) => {
  const result = await pool.query('select id, slug, name, description, created_at from games order by created_at desc');
  res.json(result.rows);
});

app.post('/api/admin/games', requireAuth, async (req, res) => {
  try {
    const { slug, name, description } = req.body;
    if (!slug || !name) return res.status(400).json({ error: 'slug y name son requeridos' });
    const result = await pool.query(
      'insert into games (slug, name, description) values ($1,$2,$3) returning *',
      [slug, name, description || null]
    );
    res.json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Ya existe un juego con ese slug' });
    console.error(err);
    res.status(500).json({ error: 'Error creando el juego' });
  }
});

// Guardar el contenido editable del juego (personaje, preguntas, caminos, pantallas)
// body: { gameId, content }  -> content es un JSON libre que arma el editor visual
app.post('/api/admin/game-configs', requireAuth, async (req, res) => {
  try {
    const { gameId, content } = req.body;
    if (!gameId || !content) return res.status(400).json({ error: 'gameId y content son requeridos' });

    await pool.query('update game_configs set is_active = false where game_id = $1', [gameId]);

    const versionResult = await pool.query(
      'select coalesce(max(version),0)::int as v from game_configs where game_id = $1',
      [gameId]
    );
    const nuevaVersion = versionResult.rows[0].v + 1;

    const insert = await pool.query(
      `insert into game_configs (game_id, version, content, is_active)
       values ($1, $2, $3, true) returning *`,
      [gameId, nuevaVersion, content]
    );
    res.json(insert.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error guardando el contenido del juego' });
  }
});

app.get('/api/admin/games/:gameId/config', requireAuth, async (req, res) => {
  const result = await pool.query(
    'select * from game_configs where game_id = $1 and is_active = true',
    [req.params.gameId]
  );
  res.json(result.rows[0] || null);
});

// ------------------------------------------------------------------
// IMÁGENES — subir (protegido) y servir (público, para que Zoom/el navegador las muestre)
// body subida: { gameId, filename, mimeType, dataBase64 }
// ------------------------------------------------------------------
app.post('/api/admin/images', requireAuth, async (req, res) => {
  try {
    const { gameId, filename, mimeType, dataBase64 } = req.body;
    if (!gameId || !mimeType || !dataBase64) {
      return res.status(400).json({ error: 'gameId, mimeType y dataBase64 son requeridos' });
    }
    if (dataBase64.length > 6_000_000) {
      return res.status(400).json({ error: 'La imagen es muy pesada. Súbela en un tamaño menor a 4MB.' });
    }
    const insert = await pool.query(
      `insert into game_images (game_id, filename, mime_type, data_base64)
       values ($1, $2, $3, $4) returning id`,
      [gameId, filename || null, mimeType, dataBase64]
    );
    res.json({ id: insert.rows[0].id, url: `/api/images/${insert.rows[0].id}` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error subiendo la imagen' });
  }
});

app.get('/api/images/:id', async (req, res) => {
  try {
    const result = await pool.query('select mime_type, data_base64 from game_images where id = $1', [req.params.id]);
    if (result.rowCount === 0) return res.status(404).send('Imagen no encontrada');
    const { mime_type, data_base64 } = result.rows[0];
    res.set('Content-Type', mime_type);
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(Buffer.from(data_base64, 'base64'));
  } catch (err) {
    console.error(err);
    res.status(500).send('Error obteniendo la imagen');
  }
});

// ------------------------------------------------------------------
// Panel completo de estadísticas — útil sobre todo en modo individual,
// donde cada quien va a su ritmo por las preguntas
// ------------------------------------------------------------------
app.get('/api/sessions/:roomCode/dashboard', async (req, res) => {
  try {
    const { roomCode } = req.params;
    const session = await pool.query('select id from sessions where room_code = $1', [roomCode]);
    if (session.rowCount === 0) return res.status(404).json({ error: 'Sala no encontrada' });
    const sessionId = session.rows[0].id;

    const participantesResult = await pool.query(
      'select count(*)::int as total from participants where session_id = $1',
      [sessionId]
    );

    const choicesResult = await pool.query(
      `select step_id, path_id, count(*)::int as total
       from choices
       where session_id = $1
       group by step_id, path_id`,
      [sessionId]
    );

    const stepsStats = {};
    for (const row of choicesResult.rows) {
      if (!stepsStats[row.step_id]) stepsStats[row.step_id] = {};
      stepsStats[row.step_id][row.path_id] = row.total;
    }

    res.json({ participantsCount: participantesResult.rows[0].total, stepsStats });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error obteniendo el panel de estadísticas' });
  }
});

// ------------------------------------------------------------------
// Listado PÚBLICO de juegos disponibles (para la pantalla de crear sesión)
// ------------------------------------------------------------------
app.get('/api/games', async (req, res) => {
  try {
    const result = await pool.query('select id, slug, name, description from games order by created_at asc');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error obteniendo los juegos' });
  }
});

// ------------------------------------------------------------------
// Crear una nueva sesión/sala para un juego
// body: { gameSlug, mode: 'group' | 'individual' }
// ------------------------------------------------------------------
app.post('/api/sessions', async (req, res) => {
  try {
    const { gameSlug, mode } = req.body;
    if (!gameSlug || !['group', 'individual'].includes(mode)) {
      return res.status(400).json({ error: 'gameSlug y mode (group|individual) son requeridos' });
    }

    const gameResult = await pool.query('select id from games where slug = $1', [gameSlug]);
    if (gameResult.rowCount === 0) {
      return res.status(404).json({ error: `No existe un juego con slug '${gameSlug}'` });
    }
    const gameId = gameResult.rows[0].id;

    let roomCode;
    let intentos = 0;
    while (true) {
      roomCode = generarCodigoSala();
      const existe = await pool.query('select 1 from sessions where room_code = $1', [roomCode]);
      if (existe.rowCount === 0) break;
      intentos++;
      if (intentos > 10) throw new Error('No se pudo generar un código único');
    }

    const hostToken = nanoid(24);

    const insert = await pool.query(
      `insert into sessions (game_id, room_code, mode, status, host_token)
       values ($1, $2, $3, 'lobby', $4)
       returning id, room_code, mode, status, host_token`,
      [gameId, roomCode, mode, hostToken]
    );

    res.json(insert.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error creando la sesión' });
  }
});

// ------------------------------------------------------------------
// Obtener info pública de una sesión (para presentador y jugadores)
// ------------------------------------------------------------------
app.get('/api/sessions/:roomCode', async (req, res) => {
  try {
    const { roomCode } = req.params;
    const result = await pool.query(
      `select s.id, s.room_code, s.mode, s.status, s.current_step,
              g.slug as game_slug, g.name as game_name,
              gc.content as game_content
       from sessions s
       join games g on g.id = s.game_id
       left join game_configs gc on gc.game_id = g.id and gc.is_active = true
       where s.room_code = $1`,
      [roomCode]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Sala no encontrada' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error obteniendo la sesión' });
  }
});

// ------------------------------------------------------------------
// Un participante se une a la sala con su nombre
// ------------------------------------------------------------------
app.post('/api/sessions/:roomCode/join', async (req, res) => {
  try {
    const { roomCode } = req.params;
    const { name } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'El nombre es requerido' });

    const session = await pool.query('select id from sessions where room_code = $1', [roomCode]);
    if (session.rowCount === 0) return res.status(404).json({ error: 'Sala no encontrada' });
    const sessionId = session.rows[0].id;

    const insert = await pool.query(
      `insert into participants (session_id, name) values ($1, $2)
       returning id, name, joined_at`,
      [sessionId, name.trim()]
    );

    const participant = insert.rows[0];
    io.to(roomCode).emit('participant:joined', participant);
    res.json({ participantId: participant.id, sessionId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al unirse a la sala' });
  }
});

// ------------------------------------------------------------------
// Un participante elige un camino (vota)
// body: { participantId, stepId, pathId, isCorrect }
// ------------------------------------------------------------------
app.post('/api/sessions/:roomCode/choice', async (req, res) => {
  try {
    const { roomCode } = req.params;
    const { participantId, stepId, pathId, isCorrect } = req.body;
    if (!participantId || !stepId || !pathId) {
      return res.status(400).json({ error: 'participantId, stepId y pathId son requeridos' });
    }

    const session = await pool.query('select id from sessions where room_code = $1', [roomCode]);
    if (session.rowCount === 0) return res.status(404).json({ error: 'Sala no encontrada' });
    const sessionId = session.rows[0].id;

    await pool.query(
      `insert into choices (session_id, participant_id, step_id, path_id, is_correct)
       values ($1, $2, $3, $4, $5)`,
      [sessionId, participantId, stepId, pathId, isCorrect ?? null]
    );

    const stats = await obtenerEstadisticas(sessionId, stepId);
    io.to(roomCode).emit('stats:updated', { stepId, stats });

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error registrando la elección' });
  }
});

// ------------------------------------------------------------------
// Obtener estadísticas de un paso específico
// ------------------------------------------------------------------
async function obtenerEstadisticas(sessionId, stepId) {
  const result = await pool.query(
    `select path_id, count(*)::int as total
     from choices
     where session_id = $1 and step_id = $2
     group by path_id`,
    [sessionId, stepId]
  );
  const stats = {};
  for (const row of result.rows) stats[row.path_id] = row.total;
  return stats;
}

app.get('/api/sessions/:roomCode/stats/:stepId', async (req, res) => {
  try {
    const { roomCode, stepId } = req.params;
    const session = await pool.query('select id from sessions where room_code = $1', [roomCode]);
    if (session.rowCount === 0) return res.status(404).json({ error: 'Sala no encontrada' });
    const stats = await obtenerEstadisticas(session.rows[0].id, stepId);
    res.json({ stats });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error obteniendo estadísticas' });
  }
});

// ------------------------------------------------------------------
// El presentador avisa a TODOS (incluidos los celulares) que muestren
// la pantalla de correcto/incorrecto del camino ganador — antes de avanzar
// body: { hostToken, stepId, winningPathId }
// ------------------------------------------------------------------
app.post('/api/sessions/:roomCode/feedback', async (req, res) => {
  try {
    const { roomCode } = req.params;
    const { hostToken, stepId, winningPathId } = req.body;

    const session = await pool.query('select host_token from sessions where room_code = $1', [roomCode]);
    if (session.rowCount === 0) return res.status(404).json({ error: 'Sala no encontrada' });
    if (session.rows[0].host_token !== hostToken) return res.status(403).json({ error: 'No autorizado' });

    io.to(roomCode).emit('session:feedback', { stepId, winningPathId });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error enviando el feedback' });
  }
});

// ------------------------------------------------------------------
// El presentador (host) avanza la sala al siguiente paso — solo modo grupal
// body: { hostToken, nextStep, status }
// ------------------------------------------------------------------
app.post('/api/sessions/:roomCode/advance', async (req, res) => {
  try {
    const { roomCode } = req.params;
    const { hostToken, nextStep, status } = req.body;

    const session = await pool.query(
      'select id, host_token from sessions where room_code = $1',
      [roomCode]
    );
    if (session.rowCount === 0) return res.status(404).json({ error: 'Sala no encontrada' });
    if (session.rows[0].host_token !== hostToken) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    const nuevoEstado = status || 'playing';
    await pool.query(
      'update sessions set current_step = $1, status = $2 where id = $3',
      [nextStep, nuevoEstado, session.rows[0].id]
    );

    io.to(roomCode).emit('session:advanced', { currentStep: nextStep, status: nuevoEstado });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error avanzando la sesión' });
  }
});

// ------------------------------------------------------------------
// WebSockets: cada cliente se une a la "sala" (roomCode) para recibir eventos
// ------------------------------------------------------------------
io.on('connection', (socket) => {
  socket.on('room:enter', (roomCode) => {
    socket.join(roomCode);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Servidor del motor corriendo en el puerto ${PORT}`));
