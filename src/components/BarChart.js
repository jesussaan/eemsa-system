import { ResponsiveContainer, BarChart as RBar, Bar, XAxis, YAxis, Tooltip, ReferenceLine, Cell } from 'recharts';

const Tip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#181b24', border: '1px solid #2d3249', borderRadius: 8, padding: '7px 12px', fontSize: 12, boxShadow: '0 4px 16px rgba(0,0,0,0.4)' }}>
      <div style={{ color: '#9aa0bc', marginBottom: 2 }}>{label}</div>
      <div style={{ color: '#e8ecf4', fontWeight: 700, fontSize: 14 }}>{payload[0].value}</div>
    </div>
  );
};

export default function BarChart({ data, meta, lowerIsBetter = false }) {
  if (!data?.length) return null;
  return (
    <ResponsiveContainer width="100%" height={120}>
      <RBar data={data} barCategoryGap="18%" margin={{ top: 6, right: 4, bottom: 0, left: 0 }}>
        <XAxis dataKey="lbl" tick={{ fill: '#545a78', fontSize: 9 }} axisLine={false} tickLine={false} />
        <YAxis hide domain={[0, 'auto']} />
        <Tooltip content={<Tip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
        {meta > 0 && <ReferenceLine y={meta} stroke="rgba(255,77,77,0.55)" strokeDasharray="4 3" />}
        <Bar dataKey="val" radius={[3, 3, 0, 0]}>
          {data.map((d, i) => {
            const ok = !meta || (lowerIsBetter ? d.val <= meta : d.val >= meta);
            return <Cell key={i} fill={d.val ? (ok ? '#4be87a' : '#ff4d4d') : '#1e2132'} />;
          })}
        </Bar>
      </RBar>
    </ResponsiveContainer>
  );
}
