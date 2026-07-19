import { useState } from 'react';
import { useRouter } from 'next/router';

// Página principal — SOLO para participantes. Es segura para compartir:
// no muestra ninguna opción de crear salas.
export default function Home() {
  const router = useRouter();
  const [roomCode, setRoomCode] = useState('');

  return (
    <div className="container">
      <h1 className="title">Entrar a una sala</h1>
      <p className="subtitle">Escribe el código que te dio el presentador</p>

      <div className="card">
        <input
          className="input"
          placeholder="Código de sala (ej: AB12C)"
          value={roomCode}
          onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === 'Enter' && roomCode.trim() && router.push(`/play/${roomCode.trim()}`)}
        />
        <button
          className="btn"
          style={{ marginTop: 12 }}
          disabled={!roomCode.trim()}
          onClick={() => router.push(`/play/${roomCode.trim()}`)}
        >
          Entrar a la sala
        </button>
      </div>
    </div>
  );
}
