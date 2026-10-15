import type { ReactNode } from 'react';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface Toast {
  id: number;
  tone: 'info' | 'success' | 'error';
  title: ReactNode;
  body?: ReactNode;
  action?: ToastAction;
  /** Milliseconds before it closes itself; 0 keeps it until dismissed. */
  duration: number;
  /** Shows a countdown bar (used by undo windows). */
  countdown?: boolean;
}

type Listener = (toasts: Toast[]) => void;

let toasts: Toast[] = [];
let seq = 0;
const listeners = new Set<Listener>();
const emit = () => listeners.forEach((l) => l(toasts));

/**
 * A tiny global toast store. It lives in core, so every module and the console
 * share one stack and toasts survive navigating between modules.
 */
export const toast = {
  subscribe(listener: Listener) {
    listeners.add(listener);
    return () => void listeners.delete(listener);
  },
  snapshot: () => toasts,

  show(input: Omit<Toast, 'id' | 'duration'> & { duration?: number }): number {
    const id = ++seq;
    const duration = input.duration ?? (input.tone === 'error' ? 10_000 : 6_000);
    toasts = [...toasts.slice(-3), { ...input, id, duration }];
    emit();
    return id;
  },

  dismiss(id: number) {
    toasts = toasts.filter((t) => t.id !== id);
    emit();
  },

  /**
   * Runs `commit` after a delay unless the viewer presses Undo first, the pattern
   * for actions that can't be reversed once they reach the server.
   */
  undoable({
    title,
    body,
    delay = 5_000,
    commit,
    onUndo,
  }: {
    title: ReactNode;
    body?: ReactNode;
    delay?: number;
    commit: () => void;
    onUndo?: () => void;
  }) {
    let done = false;
    const id = toast.show({
      tone: 'info',
      title,
      body,
      duration: delay,
      countdown: true,
      action: {
        label: 'Undo',
        onClick: () => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          toast.dismiss(id);
          onUndo?.();
          toast.show({ tone: 'info', title: 'Cancelled. Nothing was sent.' });
        },
      },
    });
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      toast.dismiss(id);
      commit();
    }, delay);
  },
};
