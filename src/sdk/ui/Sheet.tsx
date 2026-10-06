import { useEffect, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';

/** Bottom sheet on phones, centred dialog on larger screens. Wrap in <AnimatePresence>. */
export function Sheet({ title, icon, onClose, children, wide }: { title: ReactNode; icon?: ReactNode; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[45] bg-ink/45 backdrop-blur-[2px] flex items-end sm:items-center justify-center sm:p-6"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 420, damping: 38 }}
        className={`bg-paper w-full ${wide ? 'sm:max-w-2xl' : 'sm:max-w-md'} rounded-t-[2rem] sm:rounded-[2rem] px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl max-h-[90dvh] overflow-y-auto overscroll-contain`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1.5 rounded-full bg-ink/15 mx-auto mb-3 sm:hidden" />
        <div className="flex items-center gap-2.5 mb-4">
          {icon}
          <div className="text-lg font-black flex-1 min-w-0 truncate">{title}</div>
          <button onClick={onClose} className="p-2 -mr-2 rounded-xl text-ink-soft active:bg-ink/10" aria-label="close">
            <X size={20} />
          </button>
        </div>
        {children}
      </motion.div>
    </motion.div>
  );
}
