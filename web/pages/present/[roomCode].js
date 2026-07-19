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
  const [stepsStats, setStepsStats] = useState({}); // { [stepId]: { [pathId]: total } }
  const [phase, setPhase] = useState('lobby'); // lobby | question | feedback | end | dashboard
  const [feedbackPathId, setFeedbackPathId] = useState(null);
  const socketRef = useRef(null);

  useEffect(() => {
    if (!roomCode) return;
    setHostToken(localStorage.getItem(`host_${roomCode}`));

    api.getSession(roomCode).then((s) => {
      setSession(s);
      if (s.mode === 'individual' && s.status !== 'lobby') {
        api.getDashboard(roomCode).then((d) => {
          setParticipantsCount(d.participantsCount);
          setStepsStats(d.stepsStats);
        });
        setPhase(s.status === 'finished' ? 'end' : 'dashboard');
      } else if (s.current_step) {
        setCurrentStepId(s.current_step);
        setPhase(s.status === 'finished' ? 'end' : 'question');
      }
    });

    const socket = enterRoom(roomCode);
    socketRef.current = socket;

    socket.on('participant:joined', () => setParticipantsCount((n) => n + 1));
    socket.on('stats:updated', ({ stepId, stats }) => {
      setStepsStats((prev) => ({ ...prev, [stepId]: stats }));
    });
    socket.on('session:advanced', ({ currentStep, status }) => {
      setCurrentStepId(currentStep);
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
    if (session.mode === 'individual') {
      setPhase('dashboard');
    }
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
    const stats = stepsStats[currentStepId] || {};
    const step = content.steps[currentStepId];
    const pathIdGanador = ganador(stats) || step.paths[0].id;
    const path = step.paths.find((p) => p.id === pathIdGanador);
    setFeedbackPathId(pathIdGanador);
    setPhase('feedback');

    await api.sendFeedback(roomCode, hostToken, currentStepId, pathIdGanador);

    setTimeout(async () => {
      const siguiente = path.nextStepId;
      if (siguiente === 'END') {
        await api.advanceSession(roomCode, hostToken, null, 'finished');
      } else {
        await api.advanceSession(roomCode, hostToken, siguiente, 'playing');
      }
    }, 3500);
  }

  const exitButton = (
    <button className="btn btn-secondary" style={{ width: 'auto', padding: '8px 14px' }} onClick={salirYTerminar}>
      ✕ Salir
    </button>
  );

  // -------------------- LOBBY --------------------
  if (phase === 'lobby') {
    return (
      <div className="present-wrap center">
        <div style={{ textAlign: 'right' }}>{exitButton}</div>
        {content.character?.imageUrl && (
          <img src={content.character.imageUrl} alt={content.character.name} className="present-char" />
        )}
        <h1 className="present-title">{content.character?.name || session.game_name}</h1>
        <p className="subtitle" style={{ fontSize: 20 }}>Modalidad: {session.mode === 'group' ? 'Grupal' : 'Individual'}</p>

        <div className="room-code">{roomCode}</div>

        <div className="card" style={{ maxWidth: 320, margin: '16px auto 0' }}>
          <img src={qrUrl} alt="QR para unirse" style={{ borderRadius: 12, width: '100%' }} />
          <p style={{ marginTop: 12 }}>O entra desde tu celular a:</p>
          <p style={{ wordBreak: 'break-all', color: '#60a5fa' }}>{joinUrl}</p>
          <p className="badge">{participantsCount} conectados</p>
        </div>

        <button className="btn" style={{ marginTop: 24, maxWidth: 320, margin: '24px auto 0' }} onClick={iniciarJuego}>
          Iniciar juego
        </button>
      </div>
    );
  }

  // -------------------- FIN --------------------
  if (phase === 'end') {
    return (
      <div className="present-wrap center">
        <h1 className="present-title">Juego terminado</h1>
        <p className="subtitle" style={{ fontSize: 20 }}>Gracias por participar</p>
      </div>
    );
  }

  // -------------------- PANEL EN VIVO (modo individual) --------------------
  if (phase === 'dashboard') {
    const stepIds = Object.keys(content.steps);
    return (
      <div className="present-wrap">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p className="badge">Sala {roomCode} · {participantsCount} conectados · avanzando cada quien a su ritmo</p>
          {exitButton}
        </div>
        <h1 className="present-title">Panel en vivo</h1>

        {stepIds.map((stepId) => {
          const step = content.steps[stepId];
          const stats = stepsStats[stepId] || {};
          const total = Object.values(stats).reduce((a, b) => a + b, 0);
          return (
            <div key={stepId} className="card" style={{ marginTop: 20 }}>
              <h3 style={{ marginTop: 0 }}>{step.title}</h3>
              {step.paths.map((path) => {
                const votos = stats[path.id] || 0;
                const pct = total ? Math.round((votos / total) * 100) : 0;
                return (
                  <div key={path.id} className="stat-row" style={{ marginTop: 12 }}>
                    <div className="stat-label" style={{ fontSize: 16 }}>
                      <span>{path.label}{path.correct ? ' ✔' : ''}</span>
                      <span>{votos} respuesta{votos === 1 ? '' : 's'}</span>
                    </div>
                    <div className="stat-track" style={{ height: 22 }}>
                      <div className="stat-fill" style={{ width: `${Math.max(pct, votos > 0 ? 6 : 0)}%`, fontSize: 13 }}>
                        {pct > 0 ? `${pct}%` : ''}
                      </div>
                    </div>
                  </div>
                );
              })}
              <p className="present-total" style={{ textAlign: 'left', marginTop: 10 }}>
                Total de respuestas en esta pregunta: {total}
              </p>
            </div>
          );
        })}
      </div>
    );
  }

  const step = content.steps[currentStepId];

  // -------------------- FEEDBACK (correcto/incorrecto) --------------------
  if (phase === 'feedback') {
    const path = step.paths.find((p) => p.id === feedbackPathId);
    const screen = path.correct ? content.screens.correct : content.screens.incorrect;
    return (
      <div className="present-wrap center">
        <div style={{ textAlign: 'right' }}>{exitButton}</div>
        <h1 className="present-title">{screen.title}</h1>
        {screen.imageUrl && <img className="present-scene" src={screen.imageUrl} alt={screen.title} />}
      </div>
    );
  }

  // -------------------- PREGUNTA EN VIVO (modo grupal) --------------------
  const stats = stepsStats[currentStepId] || {};
  const totalVotos = Object.values(stats).reduce((a, b) => a + b, 0);

  return (
    <div className="present-wrap">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <p className="badge">Sala {roomCode} · {participantsCount} conectados</p>
        {exitButton}
      </div>
      <h1 className="present-title">{step.title}</h1>
      {step.imageUrl && <img className="present-scene" src={step.imageUrl} alt="" />}

      {step.paths.map((path) => {
        const votos = stats[path.id] || 0;
        const pct = totalVotos ? Math.round((votos / totalVotos) * 100) : 0;
        return (
          <div key={path.id} className="stat-row">
            <div className="stat-label">
              <span>{path.label}</span>
              <span>{votos} voto{votos === 1 ? '' : 's'}</span>
            </div>
            <div className="stat-track">
              <div className="stat-fill" style={{ width: `${Math.max(pct, votos > 0 ? 6 : 0)}%` }}>
                {pct > 0 ? `${pct}%` : ''}
              </div>
            </div>
          </div>
        );
      })}

      <p className="present-total">Total de votos: {totalVotos}</p>

      {session.mode === 'group' && (
        <button className="btn" style={{ marginTop: 28, maxWidth: 420, margin: '28px auto 0' }} onClick={cerrarVotacionYContinuar}>
          Cerrar votación y continuar
        </button>
      )}
    </div>
  );
}
