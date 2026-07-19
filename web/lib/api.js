const API_URL = process.env.NEXT_PUBLIC_API_URL;

async function req(path, options = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Error de conexión con el servidor');
  return data;
}

export const api = {
  API_URL,
  getGames: () => req('/api/games'),
  createSession: (gameSlug, mode) =>
    req('/api/sessions', { method: 'POST', body: JSON.stringify({ gameSlug, mode }) }),
  getSession: (roomCode) => req(`/api/sessions/${roomCode}`),
  joinSession: (roomCode, name) =>
    req(`/api/sessions/${roomCode}/join`, { method: 'POST', body: JSON.stringify({ name }) }),
  submitChoice: (roomCode, participantId, stepId, pathId, isCorrect) =>
    req(`/api/sessions/${roomCode}/choice`, {
      method: 'POST',
      body: JSON.stringify({ participantId, stepId, pathId, isCorrect }),
    }),
  getStats: (roomCode, stepId) => req(`/api/sessions/${roomCode}/stats/${stepId}`),
  advanceSession: (roomCode, hostToken, nextStep, status) =>
    req(`/api/sessions/${roomCode}/advance`, {
      method: 'POST',
      body: JSON.stringify({ hostToken, nextStep, status }),
    }),
  sendFeedback: (roomCode, hostToken, stepId, winningPathId) =>
    req(`/api/sessions/${roomCode}/feedback`, {
      method: 'POST',
      body: JSON.stringify({ hostToken, stepId, winningPathId }),
    }),
};
