import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/router';

export default function Home() {
  const router = useRouter();
  const [roomCode, setRoomCode] = useState('');

  return (
    <div className="container">
      <h1 className="title">Plataforma de juegos en vivo</h1>
      <p className="subtitle">Elige qué quieres hacer</p>

      <div className="card">
        <h3>Soy el presentador</h3>
        <p className="subtitle">Voy a compartir mi pantalla en Zoom y crear una sala nueva.</p>
        <Link href="/host"><button className="btn">Crear una sala</button></Link>
      </div>

      <div className="card">
        <h3>Soy participante</h3>
        <p className="subtitle">Tengo un código de sala que me dieron.</p>
        <input
          className="input"
          placeholder="Código de sala (ej: AB12C)"
          value={roomCode}
          onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
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
