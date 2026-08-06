import { X } from 'lucide-react'
import type { FormEvent, ReactNode } from 'react'

export function Spinner({ label = 'Chargement…' }: { label?: string }) {
  return (
    <div className="center-state" role="status">
      <span className="spinner" />
      <p>{label}</p>
    </div>
  )
}

export function Alert({ children, tone = 'error' }: { children: ReactNode; tone?: 'error' | 'success' | 'info' }) {
  return <div className={`alert alert-${tone}`}>{children}</div>
}

export function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="empty-state">
      <div className="empty-orb" />
      <h3>{title}</h3>
      <p>{detail}</p>
    </div>
  )
}

export function Modal({
  title,
  children,
  onClose,
}: {
  title: string
  children: ReactNode
  onClose: () => void
}) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="modal" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()}>
        <header className="modal-header">
          <h2>{title}</h2>
          <button type="button" className="icon-button" aria-label="Fermer" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        {children}
      </section>
    </div>
  )
}

export function Form({
  children,
  onSubmit,
}: {
  children: ReactNode
  onSubmit: (event: FormEvent<HTMLFormElement>) => void | Promise<void>
}) {
  return (
    <form className="form-stack" onSubmit={(event) => void onSubmit(event)}>
      {children}
    </form>
  )
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint ? <small>{hint}</small> : null}
    </label>
  )
}

export function ConfirmButton({
  children,
  busy,
  tone = 'primary',
}: {
  children: ReactNode
  busy?: boolean
  tone?: 'primary' | 'danger'
}) {
  return (
    <button type="submit" className={`button button-${tone}`} disabled={busy}>
      {busy ? 'Traitement…' : children}
    </button>
  )
}
