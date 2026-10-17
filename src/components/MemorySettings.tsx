import { useState, type FormEvent } from 'react'
import { Brain, Plus, X } from 'lucide-react'
import { COACH_NAME } from '../lib/coach'
import { useAddMemory, useDeleteMemory, useMemories } from '../lib/coach-queries'
import { ErrorNote, Skeleton, Spinner } from './ui'

/** Everything Saffron remembers about you, with add and delete. Stored in your account (RLS-protected). */
export function MemorySettings() {
  const memories = useMemories()
  const add = useAddMemory()
  const remove = useDeleteMemory()
  const [draft, setDraft] = useState('')

  function submit(e: FormEvent) {
    e.preventDefault()
    const content = draft.trim()
    if (content.length < 2 || add.isPending) return
    add.mutate(content, { onSuccess: () => setDraft('') })
  }

  return (
    <section id="memory" className="card scroll-mt-24 p-5 sm:p-6" aria-labelledby="memory-heading">
      <div className="flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-energy-track text-energy">
          <Brain className="size-4.5" aria-hidden />
        </div>
        <div>
          <h2 id="memory-heading" className="text-[15px] font-semibold">
            What {COACH_NAME} remembers
          </h2>
          <p className="mt-0.5 text-[13px] text-muted">
            Facts {COACH_NAME} saved from your chats to personalise advice. Remove anything that’s wrong, or add your own.
          </p>
        </div>
      </div>

      <div className="mt-4">
        {memories.isPending ? (
          <Skeleton className="h-16" />
        ) : memories.isError ? (
          <ErrorNote>{memories.error.message}</ErrorNote>
        ) : memories.data.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line px-4 py-4 text-center text-sm text-muted">
            Nothing yet. Tell {COACH_NAME} about your diet, allergies or routine and it will remember.
          </p>
        ) : (
          <ul className="divide-y divide-line rounded-xl border border-line">
            {memories.data.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                <span className="min-w-0 break-words">{m.content}</span>
                <button
                  type="button"
                  className="icon-btn size-8 shrink-0 hover:text-critical"
                  aria-label={`Forget: ${m.content}`}
                  onClick={() => remove.mutate(m.id)}
                >
                  <X className="size-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <form onSubmit={submit} className="mt-3 flex gap-2">
        <label htmlFor="memory-input" className="sr-only">
          Add something for {COACH_NAME} to remember
        </label>
        <input
          id="memory-input"
          value={draft}
          maxLength={300}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="e.g. Vegetarian, no onion or garlic"
          className="field"
        />
        <button type="submit" className="btn-secondary shrink-0" disabled={draft.trim().length < 2 || add.isPending}>
          {add.isPending ? <Spinner /> : <Plus className="size-4" aria-hidden />}
          Add
        </button>
      </form>
      {(add.isError || remove.isError) && (
        <div className="mt-2">
          <ErrorNote>{(add.error ?? remove.error)?.message}</ErrorNote>
        </div>
      )}
    </section>
  )
}
