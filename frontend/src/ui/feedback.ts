import { readonly, ref } from 'vue'

export type FeedbackKind = 'success' | 'error' | 'info'

export interface FeedbackMessage {
  id: number
  kind: FeedbackKind
  text: string
  timeout: number
}

const messages = ref<FeedbackMessage[]>([])
let nextId = 1

function show(kind: FeedbackKind, text: string, timeout = 5000): number {
  const id = nextId++
  messages.value = [...messages.value, { id, kind, text, timeout }]
  if (timeout > 0) window.setTimeout(() => dismiss(id), timeout)
  return id
}

function dismiss(id: number): void {
  messages.value = messages.value.filter((message) => message.id !== id)
}

function clear(): void {
  messages.value = []
}

export function useFeedback() {
  return {
    messages: readonly(messages),
    show,
    dismiss,
    clear,
    success: (text: string) => show('success', text),
    error: (text: string) => show('error', text, 7000),
    info: (text: string) => show('info', text),
  }
}
