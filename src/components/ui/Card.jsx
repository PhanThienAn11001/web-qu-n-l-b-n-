export function Card({ className = '', ...props }) {
  return <section className={`rounded-2xl border border-slate-200 bg-white shadow-sm ${className}`} {...props} />;
}

export function CardHeader({ className = '', ...props }) {
  return <div className={`border-b border-slate-100 px-5 py-4 ${className}`} {...props} />;
}

export function CardTitle({ className = '', ...props }) {
  return <h2 className={`text-base font-semibold text-slate-950 ${className}`} {...props} />;
}

export function CardContent({ className = '', ...props }) {
  return <div className={`p-5 ${className}`} {...props} />;
}
