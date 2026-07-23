import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { adminApi } from '../../lib/adminApi';
import AdminNav from '../../components/AdminNav';

export default function Dashboard() {
  const router = useRouter();
  const [games, setGames] = useState([]);
  const [error, setError] = useState('');
  const [creando, setCreando] = useState(false);
  const [nombre, setNombre] = useState('');

  useEffect(() => {
    if (!adminApi.isLoggedIn()) { router.push('/editor'); return; }
    cargar();
  }, []);

  function cargar() {
    adminApi.getGames().then(setGames).catch((e) => setError(e.message));
  }

  function slugify(texto) {
    return texto.toLowerCase().trim()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  }

  async function crearJuego() {
    if (!nombre.trim()) return;
    try {
      const juego = await adminApi.createGame(slugify(nombre), nombre, '');
      setNombre('');
      setCreando(false);
      cargar();
      router.push(`/editor/${juego.id}`);
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div className="container">
      <AdminNav active="editor" />
      <h1 className="title">Tus juegos</h1>
      <p className="subtitle">Conectado como {adminApi.currentUsername()}</p>

      {error && <p style={{ color: '#e5484d' }}>{error}</p>}

      {games.map((g) => (
        <div className="card" key={g.id} style={{ cursor: 'pointer' }} onClick={() => router.push(`/editor/${g.id}`)}>
          <h3>{g.name}</h3>
          <p className="subtitle">slug: {g.slug}</p>
        </div>
      ))}

      <div className="card">
        {!creando ? (
          <button className="btn" onClick={() => setCreando(true)}>+ Crear nuevo juego</button>
        ) : (
          <>
            <label className="label">Nombre del juego</label>
            <input className="input" placeholder="ej: Chiper, el camino correcto" value={nombre}
              onChange={(e) => setNombre(e.target.value)} />
            <button className="btn" style={{ marginTop: 12 }} onClick={crearJuego}>Crear</button>
          </>
        )}
      </div>
    </div>
  );
}
