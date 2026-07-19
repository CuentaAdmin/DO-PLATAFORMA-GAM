import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { adminApi } from '../../lib/adminApi';

function contenidoVacio() {
  return {
    character: { name: '', imageUrl: '' },
    startStepId: '',
    steps: {},
    screens: {
      correct: { title: '¡Correcto!', imageUrl: '' },
      incorrect: { title: 'Camino incorrecto, intenta de nuevo', imageUrl: '' },
    },
  };
}

function nuevoStep(numero) {
  const id = `step_${Date.now()}_${numero}`;
  return {
    id,
    data: {
      title: 'Nueva pregunta',
      imageUrl: '',
      paths: [
        { id: 'a', label: 'Opción A', correct: true, nextStepId: 'END' },
        { id: 'b', label: 'Opción B', correct: false, nextStepId: 'END' },
      ],
    },
  };
}

function ImageUploader({ gameId, url, onChange, label }) {
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState('');

  async function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setSubiendo(true);
    setError('');
    try {
      const fullUrl = await adminApi.uploadImage(gameId, file);
      onChange(fullUrl);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubiendo(false);
    }
  }

  return (
    <div style={{ marginTop: 10 }}>
      <label className="label">{label}</label>
      {url && <img src={url} alt="" style={{ width: '100%', maxHeight: 160, objectFit: 'cover', borderRadius: 8, marginTop: 6 }} />}
      <input type="file" accept="image/*" onChange={handleFile} style={{ marginTop: 8 }} />
      {subiendo && <p className="subtitle">Subiendo imagen...</p>}
      {error && <p style={{ color: '#f87171', fontSize: 13 }}>{error}</p>}
    </div>
  );
}

export default function GameEditor() {
  const router = useRouter();
  const { gameId } = router.query;

  const [content, setContent] = useState(contenidoVacio());
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);

  useEffect(() => {
    if (!adminApi.isLoggedIn()) { router.push('/editor'); return; }
    if (!gameId) return;
    adminApi.getConfig(gameId).then((cfg) => {
      if (cfg && cfg.content) setContent(cfg.content);
    }).catch((e) => setError(e.message));
  }, [gameId]);

  function actualizarCharacter(campo, valor) {
    setContent((c) => ({ ...c, character: { ...c.character, [campo]: valor } }));
  }

  function actualizarScreen(tipo, campo, valor) {
    setContent((c) => ({ ...c, screens: { ...c.screens, [tipo]: { ...c.screens[tipo], [campo]: valor } } }));
  }

  function agregarStep() {
    const { id, data } = nuevoStep(Object.keys(content.steps).length + 1);
    setContent((c) => ({
      ...c,
      steps: { ...c.steps, [id]: data },
      startStepId: c.startStepId || id,
    }));
  }

  function eliminarStep(stepId) {
    setContent((c) => {
      const steps = { ...c.steps };
      delete steps[stepId];
      return { ...c, steps, startStepId: c.startStepId === stepId ? '' : c.startStepId };
    });
  }

  function actualizarStep(stepId, campo, valor) {
    setContent((c) => ({ ...c, steps: { ...c.steps, [stepId]: { ...c.steps[stepId], [campo]: valor } } }));
  }

  function agregarPath(stepId) {
    setContent((c) => {
      const step = c.steps[stepId];
      const letras = 'abcdefghijklmnopqrstuvwxyz';
      const nuevaLetra = letras[step.paths.length] || `p${step.paths.length}`;
      const nuevoPath = { id: nuevaLetra, label: `Opción ${nuevaLetra.toUpperCase()}`, correct: false, nextStepId: 'END' };
      return { ...c, steps: { ...c.steps, [stepId]: { ...step, paths: [...step.paths, nuevoPath] } } };
    });
  }

  function eliminarPath(stepId, pathId) {
    setContent((c) => {
      const step = c.steps[stepId];
      return { ...c, steps: { ...c.steps, [stepId]: { ...step, paths: step.paths.filter((p) => p.id !== pathId) } } };
    });
  }

  function actualizarPath(stepId, pathId, campo, valor) {
    setContent((c) => {
      const step = c.steps[stepId];
      const paths = step.paths.map((p) => (p.id === pathId ? { ...p, [campo]: valor } : p));
      return { ...c, steps: { ...c.steps, [stepId]: { ...step, paths } } };
    });
  }

  async function guardar() {
    setGuardando(true);
    setError('');
    setGuardado(false);
    try {
      await adminApi.saveConfig(gameId, content);
      setGuardado(true);
      setTimeout(() => setGuardado(false), 2500);
    } catch (e) {
      setError(e.message);
    } finally {
      setGuardando(false);
    }
  }

  const stepIds = Object.keys(content.steps);

  return (
    <div className="container">
      <button className="btn btn-secondary" style={{ width: 'auto', padding: '8px 14px', marginBottom: 12 }}
        onClick={() => router.push('/editor/dashboard')}>
        ← Volver
      </button>
      <h1 className="title">Editor del juego</h1>
      {error && <p style={{ color: '#f87171' }}>{error}</p>}
      {guardado && <p style={{ color: '#4ade80' }}>✔ Guardado correctamente</p>}

      <div className="card">
        <h3>Personaje</h3>
        <label className="label">Nombre</label>
        <input className="input" value={content.character.name}
          onChange={(e) => actualizarCharacter('name', e.target.value)} placeholder="ej: Chiper" />
        <ImageUploader gameId={gameId} label="Imagen del personaje" url={content.character.imageUrl}
          onChange={(url) => actualizarCharacter('imageUrl', url)} />
      </div>

      <div className="card">
        <h3>Pantalla de respuesta correcta (se reutiliza en todo el juego)</h3>
        <label className="label">Título</label>
        <input className="input" value={content.screens.correct.title}
          onChange={(e) => actualizarScreen('correct', 'title', e.target.value)} />
        <ImageUploader gameId={gameId} label="Imagen" url={content.screens.correct.imageUrl}
          onChange={(url) => actualizarScreen('correct', 'imageUrl', url)} />
      </div>

      <div className="card">
        <h3>Pantalla de respuesta incorrecta (se reutiliza en todo el juego)</h3>
        <label className="label">Título</label>
        <input className="input" value={content.screens.incorrect.title}
          onChange={(e) => actualizarScreen('incorrect', 'title', e.target.value)} />
        <ImageUploader gameId={gameId} label="Imagen" url={content.screens.incorrect.imageUrl}
          onChange={(url) => actualizarScreen('incorrect', 'imageUrl', url)} />
      </div>

      <h2 style={{ marginTop: 28 }}>Preguntas y caminos</h2>

      {stepIds.map((stepId) => {
        const step = content.steps[stepId];
        return (
          <div className="card" key={stepId}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span className="badge">{stepId === content.startStepId ? 'Pregunta inicial' : stepId}</span>
              <button className="btn btn-secondary" style={{ width: 'auto', padding: '6px 12px' }}
                onClick={() => eliminarStep(stepId)}>Eliminar pregunta</button>
            </div>

            <label className="label">Título / pregunta</label>
            <input className="input" value={step.title} onChange={(e) => actualizarStep(stepId, 'title', e.target.value)} />

            <ImageUploader gameId={gameId} label="Imagen de la escena" url={step.imageUrl}
              onChange={(url) => actualizarStep(stepId, 'imageUrl', url)} />

            {stepId !== content.startStepId && (
              <button className="btn btn-secondary" style={{ marginTop: 10, width: 'auto', padding: '6px 12px' }}
                onClick={() => setContent((c) => ({ ...c, startStepId: stepId }))}>
                Marcar como pregunta inicial
              </button>
            )}

            <h4 style={{ marginTop: 16 }}>Caminos (opciones)</h4>
            {step.paths.map((path) => (
              <div key={path.id} style={{ border: '1px solid #334155', borderRadius: 10, padding: 12, marginTop: 10 }}>
                <label className="label">Texto de la opción</label>
                <input className="input" value={path.label}
                  onChange={(e) => actualizarPath(stepId, path.id, 'label', e.target.value)} />

                <label className="label">
                  <input type="checkbox" checked={path.correct}
                    onChange={(e) => actualizarPath(stepId, path.id, 'correct', e.target.checked)} />
                  {' '}Es la opción correcta
                </label>

                <label className="label">A dónde lleva este camino</label>
                <select className="input" value={path.nextStepId}
                  onChange={(e) => actualizarPath(stepId, path.id, 'nextStepId', e.target.value)}>
                  <option value="END">Terminar el juego</option>
                  {stepIds.map((sid) => (
                    <option key={sid} value={sid}>{content.steps[sid].title || sid}</option>
                  ))}
                </select>

                <button className="btn btn-secondary" style={{ marginTop: 10, width: 'auto', padding: '6px 12px' }}
                  onClick={() => eliminarPath(stepId, path.id)}>
                  Eliminar esta opción
                </button>
              </div>
            ))}
            <button className="btn btn-secondary" style={{ marginTop: 12 }} onClick={() => agregarPath(stepId)}>
              + Agregar otro camino
            </button>
          </div>
        );
      })}

      <button className="btn" style={{ marginTop: 16 }} onClick={agregarStep}>+ Agregar nueva pregunta</button>

      <button className="btn" style={{ marginTop: 28, background: '#16a34a' }} disabled={guardando} onClick={guardar}>
        {guardando ? 'Guardando...' : 'Guardar juego'}
      </button>
    </div>
  );
}
