import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { api } from '../../lib/api';
import { enterRoom } from '../../lib/socket';

export default function Play() {
  const router = useRouter();
  const { roomCode } = router.query;

  const [session, setSession] = useState(null);
  const [name, setName] = useState('');
  const [participantId, setParticipantId] = useState(null);
  const [error, setError] = useState('');

  const [currentStepId, setCurrentStepId] = useState(null);
  const [phase, setPhase] = useState('waiting'); // waiting | question | voted | feedback | end
  const [chosenPathId, setChosenPathId] = useState(null);
  const socketRef = useRef(null);

  useEffect(() => {
    if (!roomCode) return;
    api.getSession(roomCode)
      .then((s) => {
        setSession(s);
        if (s.mode === 'group' && s.current_step) {
          setCurrentStepId(s.current_step);
          setPhase(s.status === 'finished' ? 'end' : 'question');
        }
      })
      .catch((e) => setError(e.message));
  }, [roomCode]);

  useEffect(() => {
    if (!roomCode || !participantId) return;
    const socket = enterRoom(roomCode);
    socketRef.current = socket;

    if (session?.mode === 'group') {
      socket.on('session:advanced', ({ currentStep, status }) => {
        setCurrentStepId(currentStep);
        setChosenPathId(null);
        setPhase(status === 'finished' ? 'end' : 'question');
      });
    }

    return () => socket.off('session:advanced');
  }, [roomCode, participantId, session]);

  async function unirse() {
    if (!name.trim()) return;
    try {
      const r = await api.joinSession(roomCode, name);
      setParticipantId(r.participantId);
      if (session.mode === 'individual') {
        setCurrentStepId(session.game_content.startStepId);
        setPhase('question');
      }
    } catch (e) {
      setError(e.message);
    }
  }

  async function elegirCamino(path) {
    setChosenPathId(path.id);
    await api.submitChoice(roomCode, participantId, currentStepId, path.id, path.correct);

    if (session.mode === 'group') {
      setPhase('voted');
      return;
    }

    // Modo individual: cada quien avanza en su propio camino
    setPhase('feedback');
    setTimeout(() => {
      if (path.nextStepId === 'END') {
        setPhase('end');
      } else {
        setCurrentStepId(path.nextStepId);
        setChosenPathId(null);
        setPhase('question');
      }
    }, 2500);
  }

  if (!session) return <div className="container center">{error || 'Cargando...'}</div>;

  // -------------------- PANTALLA DE NOMBRE --------------------
  if (!participantId) {
    return (
      <div className="container">
        <h1 className="title">{session.game_name}</h1>
        <p className="subtitle">Escribe tu nombre para unirte a la sala {roomCode}</p>
        {error && <p style={{ color: '#f87171' }}>{error}</p>}
        <div className="card">
          <input className="input" placeholder="Tu nombre" value={name} onChange={(e) => setName(e.target.value)} />
          <button className="btn" style={{ marginTop: 16 }} disabled={!name.trim()} onClick={unirse}>
            Unirme
          </button>
        </div>
      </div>
    );
  }

  if (phase === 'waiting') {
    return (
      <div className="container center">
        <h1 className="title">Listo, {name}</h1>
        <p className="subtitle">Espera a que el presentador inicie el juego...</p>
      </div>
    );
  }

  if (phase === 'end') {
    return (
      <div className="container center">
        <h1 className="title">¡Terminaste!</h1>
        <p className="subtitle">Gracias por jugar, {name}</p>
      </div>
    );
  }

  const content = session.game_content;
  const step = content.steps[currentStepId];

  if (phase === 'feedback') {
    const path = step.paths.find((p) => p.id === chosenPathId);
    const screen = path.correct ? content.screens.correct : content.screens.incorrect;
    return (
      <div className="container center">
        <h1 className="title">{screen.title}</h1>
        {screen.imageUrl && <img className="scene" src={screen.imageUrl} alt="" />}
      </div>
    );
  }

  if (phase === 'voted') {
    return (
      <div className="container center">
        <h1 className="title">Voto enviado ✔</h1>
        <p className="subtitle">Esperando a que el presentador continúe...</p>
      </div>
    );
  }

  // -------------------- PREGUNTA --------------------
  return (
    <div className="container">
      <h1 className="title">{step.title}</h1>
      {step.imageUrl && <img className="scene" src={step.imageUrl} alt="" />}
      {step.paths.map((path) => (
        <button key={path.id} className="path-btn" onClick={() => elegirCamino(path)}>
          {path.label}
        </button>
      ))}
    </div>
  );
}
