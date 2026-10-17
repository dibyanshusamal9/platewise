import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowUp, Brain, CircleCheck, Flower2, KeyRound, Pencil, RotateCw, Target, Trash2, UtensilsCrossed } from 'lucide-react'
import { useUser } from '../lib/auth'
import { COACH_NAME, SUGGESTED_PROMPTS, parseStoredActions, type StoredAction } from '../lib/coach'
import {
  useApplyCoachAction,
  useChatMessages,
  useClearChat,
  useDismissCoachAction,
  useSendCoachMessage,
  type ChatMessage,
} from '../lib/coach-queries'
import { useGeminiKey } from '../lib/gemini-key'
import { MEAL_TYPES, fmtGrams, fmtKcal } from '../lib/nutrition'
import { GeminiKeySettings } from './GeminiKeySettings'
import { AttachButtons, PhotoStrip, usePhotoAttachments } from './PhotoAttach'
import { RichText } from './RichText'
import { ErrorNote, Skeleton, Spinner } from './ui'

/** Saffron's avatar: a crocus (the flower saffron comes from) on a warm gradient. */
export function CoachAvatar({ className = 'size-9' }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`flex shrink-0 items-center justify-center rounded-full bg-[linear-gradient(135deg,var(--saffron),var(--saffron-deep))] text-white ${className}`}
    >
      <Flower2 className="size-[55%]" />
    </span>
  )
}

export function Coach() {
  const user = useUser()
  const geminiKey = useGeminiKey(user.id)
  const messages = useChatMessages()
  const send = useSendCoachMessage()
  const clear = useClearChat()
  const [confirmClear, setConfirmClear] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  const list = messages.data ?? []
  const pending = send.isPending ? send.variables : undefined

  // Keep the newest message in view: jump there on first load, glide for new messages.
  const scrolledOnce = useRef(false)
  useEffect(() => {
    if (!list.length && !send.isPending) return
    endRef.current?.scrollIntoView({ behavior: scrolledOnce.current ? 'smooth' : 'auto', block: 'end' })
    scrolledOnce.current = true
  }, [list.length, send.isPending])

  return (
    <div className="flex min-h-[calc(100dvh-11rem)] flex-col gap-4">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <CoachAvatar className="size-11" />
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{COACH_NAME}</h1>
            <p className="text-[13px] text-muted">Your nutrition coach · plans, portions & photo explanations</p>
          </div>
        </div>
        {list.length > 0 &&
          (confirmClear ? (
            <div className="flex items-center gap-1">
              <button type="button" className="btn-ghost px-2.5 py-1.5 text-[13px]" onClick={() => setConfirmClear(false)}>
                Keep
              </button>
              <button
                type="button"
                className="btn bg-critical px-2.5 py-1.5 text-[13px] text-page"
                disabled={clear.isPending}
                onClick={() => clear.mutate(undefined, { onSettled: () => setConfirmClear(false) })}
              >
                {clear.isPending && <Spinner className="size-3.5" />}
                Clear chat
              </button>
            </div>
          ) : (
            <button type="button" className="icon-btn" aria-label="Clear chat" title="Clear chat" onClick={() => setConfirmClear(true)}>
              <Trash2 className="size-4" aria-hidden />
            </button>
          ))}
      </header>

      <div className="flex-1 space-y-4" aria-live="polite">
        {messages.isPending ? (
          <div className="space-y-3">
            <Skeleton className="ml-auto h-12 w-2/3" />
            <Skeleton className="h-24 w-4/5" />
          </div>
        ) : messages.isError ? (
          <ErrorNote>Couldn’t load your conversation: {messages.error.message}</ErrorNote>
        ) : list.length === 0 && !pending ? (
          <Welcome onPick={(text) => send.mutate({ text, photos: [] })} disabled={!geminiKey || send.isPending} />
        ) : (
          list.map((m, i) => (
            <MessageBubble key={m.id} message={m} previous={list[i - 1]} />
          ))
        )}

        {pending && (
          <>
            <div className="flex justify-end">
              <div className="max-w-[85%] space-y-2 rounded-2xl rounded-br-md bg-ink px-4 py-2.5 text-[15px] text-page opacity-80">
                {pending.photos.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {pending.photos.map((p, i) => (
                      <img key={i} src={p.thumbnail} alt="" className="size-16 rounded-lg object-cover" />
                    ))}
                  </div>
                )}
                {pending.text && <p className="whitespace-pre-wrap">{pending.text}</p>}
              </div>
            </div>
            <Thinking photos={pending.photos.length} />
          </>
        )}

        {send.isError && !send.isPending && (
          <div className="space-y-2">
            <ErrorNote>{send.error.message}</ErrorNote>
            <div className="flex flex-wrap gap-2">
              {/servers are busy|couldn.t answer/i.test(send.error.message) && send.variables && (
                <button type="button" className="btn-secondary px-3 py-1.5 text-[13px]" onClick={() => send.mutate(send.variables!)}>
                  <RotateCw className="size-4" aria-hidden />
                  Try again
                </button>
              )}
              {/Gemini API key/i.test(send.error.message) && (
                <Link to="/goals" hash="gemini-key" className="btn-secondary px-3 py-1.5 text-[13px]">
                  <KeyRound className="size-4" aria-hidden />
                  Open key settings
                </Link>
              )}
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {geminiKey ? <Composer onSend={(input) => send.mutate(input)} busy={send.isPending} /> : <GeminiKeySettings variant="setup" />}
    </div>
  )
}

function Welcome({ onPick, disabled }: { onPick: (text: string) => void; disabled: boolean }) {
  return (
    <div className="card p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <CoachAvatar />
        <div className="space-y-2 text-[15px] text-ink-2">
          <p>
            Hi, I’m <span className="font-semibold text-ink">{COACH_NAME}</span>. I can plan meals and portions around your
            targets, explain the calories in a photo of your plate, and fix or add entries in your log. You approve every
            change with one tap.
          </p>
          <p className="text-[13px] text-muted">
            I remember useful things you tell me, like being vegetarian or training in the mornings. You can review them in
            Settings.
          </p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {SUGGESTED_PROMPTS.map((prompt) => (
          <button
            key={prompt}
            type="button"
            disabled={disabled}
            onClick={() => onPick(prompt)}
            className="rounded-lg bg-surface-2 px-3 py-1.5 text-left text-[13px] text-ink-2 transition hover:text-ink disabled:opacity-50"
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  )
}

function Thinking({ photos }: { photos: number }) {
  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => clearInterval(id)
  }, [])
  return (
    <div className="flex items-start gap-2.5">
      <CoachAvatar className="size-8" />
      <div className="rounded-2xl rounded-tl-md border border-line bg-surface px-4 py-3 text-[13px] text-muted">
        <span className="inline-flex items-center gap-2">
          <Spinner className="size-3.5" />
          {seconds >= 12
            ? 'Gemini is busy, trying a backup model…'
            : photos
              ? `Looking at your photo${photos > 1 ? 's' : ''}…`
              : `${COACH_NAME} is thinking…`}
        </span>
      </div>
    </div>
  )
}

function MessageBubble({ message, previous }: { message: ChatMessage; previous?: ChatMessage }) {
  const thumbs = Array.isArray(message.photo_thumbs) ? (message.photo_thumbs as string[]) : []

  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] space-y-2 rounded-2xl rounded-br-md bg-ink px-4 py-2.5 text-[15px] text-page">
          {thumbs.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {thumbs.map((src, i) => (
                <img key={i} src={src} alt={`Photo ${i + 1}`} className="size-16 rounded-lg object-cover" />
              ))}
            </div>
          )}
          {message.content && <p className="whitespace-pre-wrap">{message.content}</p>}
        </div>
      </div>
    )
  }

  const actions = parseStoredActions(message.actions)
  const proposals = actions.filter((a) => a.type !== 'remembered' && a.type !== 'forgot')
  const notes = actions.filter((a) => a.type === 'remembered' || a.type === 'forgot')
  // A meal logged from this answer keeps the first photo of the question it answers.
  const questionThumb =
    previous?.role === 'user' && Array.isArray(previous.photo_thumbs) ? (previous.photo_thumbs[0] as string | undefined) : undefined

  return (
    <div className="flex items-start gap-2.5">
      <CoachAvatar className="size-8" />
      <div className="min-w-0 max-w-[88%] flex-1 space-y-2.5">
        <div className="rounded-2xl rounded-tl-md border border-line bg-surface px-4 py-3 text-[15px] leading-relaxed text-ink-2">
          <RichText text={message.content} />
        </div>
        {proposals.map((action) => (
          <ActionCard key={action.id} message={message} action={action} photoThumb={questionThumb} />
        ))}
        {notes.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {notes.map((n) => (
              <Link
                key={n.id}
                to="/goals"
                hash="memory"
                className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-1 text-xs text-ink-2 hover:text-ink"
              >
                <Brain className="size-3.5 shrink-0 text-energy" aria-hidden />
                <span className="truncate">
                  {n.type === 'remembered' ? 'Remembered' : 'Forgot'}: {'content' in n ? n.content : ''}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

const MEAL_LABEL = Object.fromEntries(MEAL_TYPES.map((t) => [t.value, t.label]))

function ActionCard({ message, action, photoThumb }: { message: ChatMessage; action: StoredAction; photoThumb?: string }) {
  const apply = useApplyCoachAction()
  const dismiss = useDismissCoachAction()
  const busy = apply.isPending || dismiss.isPending

  const view = useMemo(() => describe(action), [action])
  if (!view) return null
  const Icon = view.icon

  return (
    <div className={`card p-3.5 ${action.status === 'dismissed' ? 'opacity-55' : ''}`}>
      <div className="flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-energy-track text-energy">
          <Icon className="size-4.5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-medium leading-snug">{view.title}</p>
          <p className="mt-0.5 text-[13px] text-muted">{view.detail}</p>
          {view.items && view.items.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-[12px] text-ink-2">
              {view.items.map((it, i) => (
                <li key={i} className="flex justify-between gap-3">
                  <span className="truncate">
                    {it.name}
                    {it.portion && <span className="text-muted"> · {it.portion}</span>}
                  </span>
                  <span className="num shrink-0">{fmtKcal(it.Calories)} kcal</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {apply.isError && (
        <div className="mt-3">
          <ErrorNote>{apply.error.message}</ErrorNote>
        </div>
      )}

      <div className="mt-3 flex items-center justify-end gap-2">
        {action.status === 'applied' ? (
          <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-good">
            <CircleCheck className="size-4" aria-hidden /> {view.doneLabel}
          </span>
        ) : action.status === 'dismissed' ? (
          <span className="text-[13px] text-muted">Dismissed</span>
        ) : (
          <>
            <button
              type="button"
              className="btn-ghost px-3 py-1.5 text-[13px]"
              disabled={busy}
              onClick={() => dismiss.mutate({ message, actionId: action.id })}
            >
              Dismiss
            </button>
            <button
              type="button"
              className="btn-primary px-3 py-1.5 text-[13px]"
              disabled={busy}
              onClick={() => apply.mutate({ message, action, photoThumb })}
            >
              {apply.isPending && <Spinner className="size-3.5" />}
              {view.applyLabel}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function describe(action: StoredAction) {
  switch (action.type) {
    case 'log_meal':
      return {
        icon: UtensilsCrossed,
        title: action.meal_name,
        detail: `${MEAL_LABEL[action.meal_type]} · ${fmtKcal(action.calories)} kcal · P ${fmtGrams(action.protein)} · C ${fmtGrams(action.carbs)} · F ${fmtGrams(action.fat)} g${
          action.eaten_at ? ` · ${new Date(action.eaten_at).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })}` : ''
        }`,
        items: action.items,
        applyLabel: 'Log meal',
        doneLabel: 'Logged',
      }
    case 'update_meal': {
      // Show the REAL meal the id points at (snapshotted by the server), with before → after,
      // so a mismatch between the AI's wording and the actual meal is visible before Apply.
      const t = action.target
      const arrow = (before: number | undefined, after: number, unit: string, fmt: (n: number) => string) =>
        before !== undefined && before !== after ? `${fmt(before)} → ${fmt(after)}${unit}` : `${fmt(after)}${unit}`
      const changes = [
        action.meal_name && `rename to “${action.meal_name}”`,
        action.meal_type && MEAL_LABEL[action.meal_type],
        action.calories !== undefined && arrow(t?.calories, action.calories, ' kcal', fmtKcal),
        action.protein !== undefined && `P ${arrow(t?.protein, action.protein, ' g', fmtGrams)}`,
        action.carbs !== undefined && `C ${arrow(t?.carbs, action.carbs, ' g', fmtGrams)}`,
        action.fat !== undefined && `F ${arrow(t?.fat, action.fat, ' g', fmtGrams)}`,
      ].filter(Boolean)
      const when = t
        ? new Date(t.eaten_at).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })
        : null
      return {
        icon: Pencil,
        title: t ? `Edit “${t.meal_name}”${when ? ` · ${when}` : ''}` : action.label,
        detail: changes.join(' · ') || 'No changes',
        items: undefined,
        applyLabel: 'Update meal',
        doneLabel: 'Updated',
      }
    }
    case 'update_targets':
      return {
        icon: Target,
        title: action.label,
        detail: `TDEE ${fmtKcal(action.tdee_kcal)} · target ${fmtKcal(action.calorie_target_kcal)} kcal · P ${action.protein_g} · C ${action.carbs_g} · F ${action.fat_g} g`,
        items: undefined,
        applyLabel: 'Update targets',
        doneLabel: 'Targets updated',
      }
    default:
      return null
  }
}

function Composer({
  onSend,
  busy,
}: {
  onSend: (input: { text: string; photos: { base64: string; mimeType: 'image/jpeg'; thumbnail: string }[] }) => void
  busy: boolean
}) {
  const [text, setText] = useState('')
  const attachments = usePhotoAttachments()
  const ref = useRef<HTMLTextAreaElement>(null)
  const trimmed = text.trim()
  const canSend = !busy && !attachments.preparing && (trimmed.length > 0 || attachments.photos.length > 0)

  function resize() {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`
    el.style.overflowY = el.scrollHeight > 140 ? 'auto' : 'hidden'
  }

  function submit(e?: FormEvent) {
    e?.preventDefault()
    if (!canSend) return
    onSend({
      text: trimmed,
      photos: attachments.photos.map(({ base64, mimeType, thumbnail }) => ({ base64, mimeType, thumbnail })),
    })
    setText('')
    attachments.clear()
    requestAnimationFrame(resize)
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) submit(e)
  }

  return (
    <form
      onSubmit={submit}
      className="sticky bottom-[calc(4.75rem+var(--safe-bottom))] z-[5] sm:bottom-4"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        void attachments.add([...e.dataTransfer.files])
      }}
    >
      {attachments.inputs}
      <div className="rounded-2xl border border-line bg-surface p-2 shadow-lg transition focus-within:border-energy">
        {(attachments.photos.length > 0 || attachments.preparing) && (
          <div className="px-1.5 pt-1.5 pb-2">
            <PhotoStrip attachments={attachments} disabled={busy} size="size-14" />
          </div>
        )}
        {attachments.error && <p className="px-2 pb-1 text-xs text-critical">{attachments.error}</p>}
        <div className="flex items-end gap-1">
          <AttachButtons attachments={attachments} disabled={busy} cameraLabel={null} />
          <label htmlFor="coach-input" className="sr-only">
            Message {COACH_NAME}
          </label>
          <textarea
            id="coach-input"
            ref={ref}
            rows={1}
            value={text}
            maxLength={2000}
            onChange={(e) => {
              setText(e.target.value)
              resize()
            }}
            onKeyDown={onKeyDown}
            onPaste={(e) => {
              const images = [...e.clipboardData.files].filter((f) => f.type.startsWith('image/'))
              if (images.length) {
                e.preventDefault()
                void attachments.add(images)
              }
            }}
            placeholder={attachments.photos.length ? 'Ask about these…' : `Ask ${COACH_NAME}…`}
            className="max-h-36 min-h-10 min-w-0 flex-1 resize-none overflow-hidden bg-transparent px-2 py-2 text-base leading-relaxed text-ink outline-none placeholder:text-muted sm:text-[15px]"
          />
          <button
            type="submit"
            disabled={!canSend}
            aria-label="Send"
            className="btn-primary size-10 shrink-0 rounded-full p-0"
          >
            {busy ? <Spinner /> : <ArrowUp className="size-5" aria-hidden />}
          </button>
        </div>
      </div>
    </form>
  )
}
