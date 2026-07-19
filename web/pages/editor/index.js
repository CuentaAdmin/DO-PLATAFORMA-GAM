import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { adminApi } from '../../lib/adminApi';

export default function EditorLogin() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (adminApi.isLoggedIn()) router.push('/editor/dashboard');
  }, []);

  async function entrar() {
    setLoading(true);
    setError('');
    try {
      await adminApi.login(username, password);
      router.push('/editor/dashboard');
    } catch (e) {
      setError(e.message);
      setLoading(false);
    }
  }

  return (
    <div className="container">
      <h1 className="title">Editor de contenido</h1>
      <p className="subtitle">Inicia sesión para crear y editar tus juegos</p>
      <div className="card">
        {error && <p style={{ color: '#f87171' }}>{error}</p>}
        <label className="label">Usuario</label>
        <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} />
        <label className="label">Contraseña</label>
        <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && entrar()} />
        <button className="btn" style={{ marginTop: 20 }} disabled={loading} onClick={entrar}>
          {loading ? 'Entrando...' : 'Entrar'}
        </button>
      </div>
    </div>
  );
}
