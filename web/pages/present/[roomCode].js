import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { api } from '../../lib/api';
import { enterRoom } from '../../lib/socket';

function ganador(stats) {
  let mejor = null;
  let max = -1;
  for (const [pathId, total] of Object.entries(stats || {})) {
    if (total > max) { max = total; mejor = pathId; }
  }
  return mejor;
}

export default function Present() {
  const router = useRouter();
  const { roomCode } = router.query;

  const [session, setSession] = useState(null);
  const [hostToken, setHostToken] = useState(null);
  const [participantsCount, setParticipantsCount] = useState(0);
  const [currentStepId, setCurrentStepId] = useState(null);
  const [stats, setStats] = useState({});
  const [phase, setPhase] = useState('lobby'); // lobby | question | feedback | end
  const [feedbackPathId, setFeedbackPathId] = useState(null);
  const socketRef = useRef(null);

  useEffect(() => {
    if (!roomCode) return;
    setHostToken(localStorage.getItem(`host_${roomCode}`));

    api.getSession(roomCode).then((s) => {
      setSession(s);
      if (s.current_step) {
        setCurrentStepId(s.current_step);
        setPhase(s.status === 'finished' ? 'end' : 'question');
      }
    });

    const socket = enterRoom(roomCode);
    socketRef.current = socket;

    socket.on('participant:joined', () => setParticipantsCount((n) => n + 1));
    socket.on('stats:updated', ({ stepId, stats }) => {
      setCurrentStepId((actual) => {
        if (actual === stepId) setStats(stats);
        return actual;
      });
    });
    socket.on('session:advanced', ({ currentStep, status }) => {
      setCurrentStepId(currentStep);
      setStats({});
      setPhase(status === 'finished' ? 'end' : 'question');
      setFeedbackPathId(null);
    });

    return () => {
      socket.off('participant:joined');
      socket.off('stats:updated');
      socket.off('session:advanced');
    };
  }, [roomCode]);

  if (!session) return <div className="container center">Cargando sala...</div>;

  const content = session.game_content;
  const joinUrl = typeof window !== 'undefined' ? `${window.location.origin}/play/${roomCode}` : '';
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(joinUrl)}`;

  async function iniciarJuego() {
    await api.advanceSession(roomCode, hostToken, content.startStepId, 'playing');
  }

  async function salirYTerminar() {
    const confirmar = window.confirm('¿Seguro que quieres salir? Esto termina la sesión para todos los participantes.');
    if (!confirmar) return;
    try {
      await api.advanceSession(roomCode, hostToken, null, 'finished');
    } catch (e) {
      // aunque falle la notificación, igual dejamos salir al presentador
    }
    router.push('/host');
  }

  async function cerrarVotacionYContinuar() {
    const step = content.steps[currentStepId];
    const pathIdGanador = ganador(stats) || step.paths[0].id;
    const path = step.paths.find((p) => p.id === pathIdGanador);
    setFeedbackPathId(pathIdGanador);
    setPhase('feedback');

    setTimeout(async () => {
      const siguiente = path.nextStepId;
      if (siguiente === 'END') {
        await api.advanceSession(roomCode, hostToken, null, 'finished');
      } else {
        await api.advanceSession(roomCode, hostToken, siguiente, 'playing');
      }
    }, 3500);
  }

  // -------------------- LOBBY --------------------
  if (phase === 'lobby') {
    return (
      <div className="container center">
        <div style={{ textAlign: 'right' }}>
          <button className="btn btn-secondary" style={{ width: 'auto', padding: '8px 14px' }} onClick={salirYTerminar}>
            ✕ Salir
          </button>
        </div>
        {content.character?.imageUrl && (
          <img src={content.character.imageUrl} alt={content.character.name}
            style={{ maxWidth: 260, margin: '0 auto', display: 'block' }} />
        )}
        <h1 className="title">{content.character?.name || session.game_name}</h1>
        <p className="subtitle">Modalidad: {session.mode === 'group' ? 'Grupal' : 'Individual'}</p>

        <div className="room-code">{roomCode}</div>

        <div className="card">
          <img src={qrUrl} alt="QR para unirse" style={{ borderRadius: 12 }} />
          <p style={{ marginTop: 12 }}>O entra desde tu celular a:</p>
          <p style={{ wordBreak: 'break-all', color: '#60a5fa' }}>{joinUrl}</p>
          <p className="badge">{participantsCount} conectados</p>
        </div>

        <button className="btn" style={{ marginTop: 24 }} onClick={iniciarJuego}>
          Iniciar juego
        </button>
      </div>
    );
  }

  // -------------------- FIN --------------------
  if (phase === 'end') {
    return (
      <div className="container center">
        <h1 className="title">Juego terminado</h1>
        <p className="subtitle">Gracias por participar</p>
      </div>
    );
  }

  const step = content.steps[currentStepId];

  // -------------------- FEEDBACK (correcto/incorrecto) --------------------
  if (phase === 'feedback') {
    const path = step.paths.find((p) => p.id === feedbackPathId);
    const screen = path.correct ? content.screens.correct : content.screens.incorrect;
    return (
      <div className="container center">
        <div style={{ textAlign: 'right' }}>
          <button className="btn btn-secondary" style={{ width: 'auto', padding: '8px 14px' }} onClick={salirYTerminar}>
            ✕ Salir
          </button>
        </div>
        <h1 className="title">{screen.title}</h1>
        {screen.imageUrl && <img className="scene" src={screen.imageUrl} alt={screen.title} />}
      </div>
    );
  }

  // -------------------- PREGUNTA EN VIVO --------------------
  const totalVotos = Object.values(stats).reduce((a, b) => a + b, 0);

  return (
    <div className="container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <p className="badge">Sala {roomCode} · {participantsCount} conectados</p>
        <button className="btn btn-secondary" style={{ width: 'auto', padding: '8px 14px' }} onClick={salirYTerminar}>
          ✕ Salir
        </button>
      </div>
      <h1 className="title">{step.title}</h1>
      {step.imageUrl && <img className="scene" src={step.imageUrl} alt="" />}

      {step.paths.map((path) => {
        const votos = stats[path.id] || 0;
        const pct = totalVotos ? Math.round((votos / totalVotos) * 100) : 0;
        return (
          <div key={path.id} style={{ marginTop: 16 }}>
            <div>{path.label}</div>
            <div className="bar-row">
              <div className="bar-track"><div className="bar-fill" style={{ width: `${pct}%` }} /></div>
              <span style={{ minWidth: 60, fontSize: 14 }}>{votos} · {pct}%</span>
            </div>
          </div>
        );
      })}

      {session.mode === 'group' && (
        <button className="btn" style={{ marginTop: 28 }} onClick={cerrarVotacionYContinuar}>
          Cerrar votación y continuar
        </button>
      )}
    </div>
  );
}
