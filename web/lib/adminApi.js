const API_URL = process.env.NEXT_PUBLIC_API_URL;

function getToken() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('editor_token');
}

async function req(path, options = {}) {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Error de conexión con el servidor');
  return data;
}

export const adminApi = {
  API_URL,
  login: async (username, password) => {
    const data = await req('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });
    localStorage.setItem('editor_token', data.token);
    localStorage.setItem('editor_username', data.username);
    return data;
  },
  logout: () => {
    localStorage.removeItem('editor_token');
    localStorage.removeItem('editor_username');
  },
  isLoggedIn: () => !!getToken(),
  currentUsername: () => (typeof window !== 'undefined' ? localStorage.getItem('editor_username') : null),

  getGames: () => req('/api/admin/games'),
  createGame: (slug, name, description) =>
    req('/api/admin/games', { method: 'POST', body: JSON.stringify({ slug, name, description }) }),

  getConfig: (gameId) => req(`/api/admin/games/${gameId}/config`),
  saveConfig: (gameId, content) =>
    req('/api/admin/game-configs', { method: 'POST', body: JSON.stringify({ gameId, content }) }),

  uploadImage: async (gameId, file) => {
    const dataBase64 = await fileToBase64(file);
    const data = await req('/api/admin/images', {
      method: 'POST',
      body: JSON.stringify({ gameId, filename: file.name, mimeType: file.type, dataBase64 }),
    });
    return `${API_URL}${data.url}`;
  },
};

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
