export default function BarChart({ data, meta, lowerIsBetter = false }) {
  const max = Math.max(...data.map(d => d.val), meta || 0, 1);
  const BAR_H = 70;
  return (
    <div style={{ paddingBottom: 14 }}>
      <div style={{ position: 'relative', height: BAR_H, display: 'flex', alignItems: 'flex-end', gap: 2 }}>
        {meta > 0 && <div style={{ position: 'absolute', left: 0, right: 0, bottom: Math.round((meta / max) * BAR_H), borderTop: '1px dashed #ff4d4d', pointerEvents: 'none', zIndex: 1 }} />}
        {data.map((d, i) => {
          const h = d.val > 0 ? Math.max(2, Math.round((d.val / max) * BAR_H)) : 2;
          const ok = !meta || (lowerIsBetter ? d.val <= meta : d.val >= meta);
          return (
            <div key={i} title={`${d.lbl}: ${d.val}`} style={{ flex: 1, height: h, background: d.val ? (ok ? '#4be87a' : '#ff4d4d') : '#1e2132', borderRadius: '2px 2px 0 0' }} />
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 2, marginTop: 2 }}>
        {data.map((d, i) => (
          <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: 8, color: '#666' }}>{d.lbl}</div>
        ))}
      </div>
    </div>
  );
}
