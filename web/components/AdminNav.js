import { useRouter } from 'next/router';
import { adminApi } from '../lib/adminApi';

export default function AdminNav({ active }) {
  const router = useRouter();

  const item = (key, label, href) => (
    <a
      href={href}
      style={{
        padding: '8px 14px',
        borderRadius: 8,
        textDecoration: 'none',
        color: 'white',
        background: active === key ? '#2563eb' : '#334155',
        fontSize: 14,
        fontWeight: 600,
      }}
    >
      {label}
    </a>
  );

  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 20 }}>
      {item('host', '🎬 Crear sala', '/host')}
      {item('editor', '📝 Editor de juegos', '/editor/dashboard')}
      <div style={{ flex: 1 }} />
      <button
        className="btn btn-secondary"
        style={{ width: 'auto', padding: '8px 14px' }}
        onClick={() => { adminApi.logout(); router.push('/editor'); }}
      >
        Salir de mi cuenta
      </button>
    </div>
  );
}
