import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { api } from '../../lib/api';

export default function HostCreate() {
  const router = useRouter();
  const [games, setGames] = useState([]);
  const [gameSlug, setGameSlug] = useState('');
  const [mode, setMode] = useState('group');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getGames()
      .then((list) => {
        setGames(list);
        if (list[0]) setGameSlug(list[0].slug);
      })
      .catch((e) => setError(e.message));
  }, []);

  async function crearSala() {
    setLoading(true);
    setError('');
    try {
      const session = await api.createSession(gameSlug, mode);
      localStorage.setItem(`host_${session.room_code}`, session.host_token);
      router.push(`/present/${session.room_code}`);
    } catch (e) {
      setError(e.message);
      setLoading(false);
    }
  }

  return (
    <div className="container">
      <div style={{ textAlign: 'right' }}>
        <button className="btn btn-secondary" style={{ width: 'auto', padding: '8px 14px' }} onClick={() => router.push('/')}>
          ✕ Salir
        </button>
      </div>
      <h1 className="title">Crear una sala</h1>
      <p className="subtitle">Elige el juego y la modalidad</p>

      <div className="card">
        {error && <p style={{ color: '#f87171' }}>{error}</p>}

        <label className="label">Juego</label>
        {games.length === 0 && !error && <p className="subtitle">Cargando juegos...</p>}
        {games.length === 0 && !error === false && null}
        <select className="input" value={gameSlug} onChange={(e) => setGameSlug(e.target.value)}>
          {games.map((g) => (
            <option key={g.slug} value={g.slug}>{g.name}</option>
          ))}
        </select>

        <label className="label">Modalidad</label>
        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          <button
            className={mode === 'group' ? 'btn' : 'btn btn-secondary'}
            onClick={() => setMode('group')}
          >
            Grupal (todos votan igual)
          </button>
          <button
            className={mode === 'individual' ? 'btn' : 'btn btn-secondary'}
            onClick={() => setMode('individual')}
          >
            Individual (cada uno por su cuenta)
          </button>
        </div>

        <button className="btn" style={{ marginTop: 24 }} disabled={!gameSlug || loading} onClick={crearSala}>
          {loading ? 'Creando...' : 'Crear sala y continuar'}
        </button>
      </div>
    </div>
  );
}
