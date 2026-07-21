import { Construction } from 'lucide-react';

/** Página provisional para rutas cuyo módulo llega en una fase posterior. */
export function PlaceholderPage({ title, phase }: { title: string; phase: number }) {
  return (
    <div>
      <h1 className="text-xl font-semibold">{title}</h1>
      <div className="mt-6 flex flex-col items-center gap-3 rounded-lg border border-dashed py-16 text-center">
        <Construction className="size-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Este módulo se construye en la <span className="font-medium text-foreground">Fase {phase}</span>.
        </p>
      </div>
    </div>
  );
}
