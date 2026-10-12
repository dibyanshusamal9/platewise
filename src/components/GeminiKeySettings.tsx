import { useState, type FormEvent } from 'react'
import { useMutation } from '@tanstack/react-query'
import { CheckCircle2, ExternalLink, Eye, EyeOff, KeyRound, ShieldCheck } from 'lucide-react'
import { useUser } from '../lib/auth'
import { GEMINI_KEY_PATTERN, clearGeminiKey, maskKey, saveGeminiKey, useGeminiKey } from '../lib/gemini-key'
import { checkGeminiKey } from '../server/meals.functions'
import { ErrorNote, Spinner } from './ui'

const AI_STUDIO_URL = 'https://aistudio.google.com/apikey'

/**
 * Bring-your-own Gemini key.
 *  - variant "setup": first-run card on the Today page (shown instead of the composer)
 *  - variant "settings": status, replace and remove on the Settings page
 */
export function GeminiKeySettings({ variant }: { variant: 'setup' | 'settings' }) {
  const user = useUser()
  const savedKey = useGeminiKey(user.id)
  const [editing, setEditing] = useState(false)

  if (variant === 'settings' && savedKey && !editing) {
    return (
      <section id="gemini-key" className="card scroll-mt-24 p-5 sm:p-6">
        <Header />
        <div className="mt-4 flex flex-col gap-3 rounded-xl bg-surface-2 p-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-2 text-sm">
            <CheckCircle2 className="size-4 text-good" aria-hidden />
            <span className="font-medium">Saved on this device</span>
            <span className="num text-muted">{maskKey(savedKey)}</span>
          </p>
          <div className="flex gap-2">
            <button type="button" className="btn-secondary px-3 py-1.5 text-[13px]" onClick={() => setEditing(true)}>
              Replace
            </button>
            <button
              type="button"
              className="btn-ghost px-3 py-1.5 text-[13px] hover:text-critical"
              onClick={() => clearGeminiKey(user.id)}
            >
              Remove
            </button>
          </div>
        </div>
        <PrivacyNote />
      </section>
    )
  }

  return (
    <section
      id="gemini-key"
      className={`card scroll-mt-24 p-5 sm:p-6 ${variant === 'setup' ? 'border-energy/40' : ''}`}
      aria-labelledby="gemini-key-heading"
    >
      <Header setup={variant === 'setup'} />
      <ol className="mt-4 space-y-1.5 text-sm text-ink-2">
        <li>
          1. Open{' '}
          <a href={AI_STUDIO_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-ink underline underline-offset-2">
            Google AI Studio <ExternalLink className="size-3.5" aria-hidden />
          </a>{' '}
          and sign in with any Google account.
        </li>
        <li>2. Tap <span className="font-medium text-ink">Create API key</span> and copy it.</li>
        <li>3. Paste it below. The free tier is plenty for everyday logging.</li>
      </ol>
      <KeyForm
        onSaved={(key) => {
          saveGeminiKey(user.id, key)
          setEditing(false)
        }}
        onCancel={variant === 'settings' && savedKey ? () => setEditing(false) : undefined}
      />
      <PrivacyNote />
    </section>
  )
}

function Header({ setup = false }: { setup?: boolean }) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-energy-track text-energy">
        <KeyRound className="size-4.5" aria-hidden />
      </div>
      <div>
        <h2 id="gemini-key-heading" className="text-[15px] font-semibold">
          {setup ? 'Connect your Gemini API key' : 'Gemini API key'}
        </h2>
        <p className="mt-0.5 text-[13px] text-muted">
          {setup
            ? 'Platewise uses your own free Google Gemini key to estimate meals.'
            : 'Your own key is used for every meal estimate and plate scan.'}
        </p>
      </div>
    </div>
  )
}

function KeyForm({ onSaved, onCancel }: { onSaved: (key: string) => void; onCancel?: () => void }) {
  const [value, setValue] = useState('')
  const [visible, setVisible] = useState(false)
  const check = useMutation({ mutationFn: (apiKey: string) => checkGeminiKey({ data: { apiKey } }) })

  const trimmed = value.trim()
  const looksValid = GEMINI_KEY_PATTERN.test(trimmed)

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!looksValid || check.isPending) return
    check.mutate(trimmed, { onSuccess: () => onSaved(trimmed) })
  }

  return (
    <form onSubmit={submit} className="mt-4 space-y-3">
      <div>
        <label htmlFor="gemini-key-input" className="label">
          API key
        </label>
        <div className="relative">
          <input
            id="gemini-key-input"
            type={visible ? 'text' : 'password'}
            value={value}
            onChange={(e) => {
              setValue(e.target.value)
              check.reset()
            }}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="Paste your key"
            className="field num pr-11"
          />
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            className="icon-btn absolute top-1/2 right-1 -translate-y-1/2"
            aria-label={visible ? 'Hide key' : 'Show key'}
          >
            {visible ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
          </button>
        </div>
        {trimmed && !looksValid && (
          <p className="mt-1.5 text-xs text-muted">That doesn’t look like a complete key yet. Copy the whole value.</p>
        )}
      </div>

      {check.isError && <ErrorNote>{check.error.message}</ErrorNote>}

      <div className="flex gap-2">
        <button type="submit" className="btn-primary" disabled={!looksValid || check.isPending}>
          {check.isPending && <Spinner />}
          {check.isPending ? 'Checking…' : 'Check & save'}
        </button>
        {onCancel && (
          <button type="button" className="btn-ghost" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  )
}

function PrivacyNote() {
  return (
    <p className="mt-4 flex items-start gap-2 text-xs text-muted">
      <ShieldCheck className="mt-px size-3.5 shrink-0" aria-hidden />
      Saved only on this device, for your account. It’s sent securely with each request, used for that one estimate,
      and never stored on our servers. Usage counts against your own Google quota.
    </p>
  )
}
