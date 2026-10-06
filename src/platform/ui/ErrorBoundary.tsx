// A crashing game must not blank the page. A failed dynamic import usually means a new build was
// deployed and this tab asked for an old chunk: ask for a reload.
import { Component, type ReactNode } from 'react';
import { S } from '../strings';

export class ErrorBoundary extends Component<{ children: ReactNode; onLeave: () => void }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    console.error('[game crashed]', error);
  }
  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const t = S.get();
    const stale = /dynamically imported module|Failed to fetch|Importing a module script failed|error loading/i.test(error.message);
    return (
      <div className="h-full flex items-center justify-center p-6">
        <div className="bg-paper rounded-3xl border-2 border-ink/10 p-6 w-full max-w-sm text-center shadow-xl">
          <div className="text-5xl mb-2">{stale ? '✨' : '🫠'}</div>
          <div className="text-xl font-black">{stale ? t.staleTitle : t.crashed}</div>
          <div className="text-sm text-ink-soft mt-1 leading-relaxed">{stale ? t.staleHint : t.crashedHint}</div>
          {!stale && <pre className="mt-3 text-[11px] text-left bg-ink/5 rounded-xl p-2 overflow-x-auto whitespace-pre-wrap break-all max-h-32 select-text">{error.message}</pre>}
          <div className="flex gap-3 mt-5">
            <button
              onClick={() => {
                this.setState({ error: null });
                this.props.onLeave();
              }}
              className="flex-1 py-2.5 rounded-2xl border-2 border-ink/15 font-semibold"
            >
              {t.back}
            </button>
            <button onClick={() => location.reload()} className="flex-1 py-2.5 rounded-2xl bg-ink text-paper font-semibold shadow-[0_4px_0_#0f0e14] active:shadow-none active:translate-y-1">
              {t.reload}
            </button>
          </div>
        </div>
      </div>
    );
  }
}
