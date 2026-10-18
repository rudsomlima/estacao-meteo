import { motion } from 'motion/react'
import type { ReactNode } from 'react'

export default function Reveal({ children, delay = 0, className = '' }: { children: ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 22 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -8% 0px' }}
      transition={{ duration: 0.6, delay, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  )
}

export function SectionHead({ id, kicker, title, children }: { id: string; kicker: string; title: string; children?: ReactNode }) {
  return (
    <div id={id} className="scroll-mt-20">
      <p className="num text-xs uppercase tracking-[0.16em] text-cyan">{kicker}</p>
      <h2 className="mt-2 font-display text-3xl font-bold tracking-tight text-balance sm:text-4xl">{title}</h2>
      {children && <p className="mt-2 max-w-2xl text-ink-2">{children}</p>}
    </div>
  )
}
