import * as React from 'react'

export type ToastVariant = 'default' | 'success' | 'destructive' | 'warning'

export interface ToastMessage {
  id: string
  title?: string
  description?: string
  variant?: ToastVariant
  duration?: number
}

type ToastAction =
  | { type: 'ADD_TOAST'; toast: ToastMessage }
  | { type: 'DISMISS_TOAST'; toastId: string }
  | { type: 'REMOVE_TOAST'; toastId: string }

interface State {
  toasts: ToastMessage[]
}

const toastTimeouts = new Map<string, ReturnType<typeof setTimeout>>()

const listeners: Array<(state: State) => void> = []

let memoryState: State = { toasts: [] }

function dispatch(action: ToastAction) {
  switch (action.type) {
    case 'ADD_TOAST':
      memoryState = {
        ...memoryState,
        toasts: [action.toast, ...memoryState.toasts].slice(0, 5),
      }
      break
    case 'DISMISS_TOAST':
    case 'REMOVE_TOAST':
      memoryState = {
        ...memoryState,
        toasts: memoryState.toasts.filter((t) => t.id !== action.toastId),
      }
      break
  }

  listeners.forEach((listener) => {
    listener(memoryState)
  })
}

let count = 0

function generateId() {
  count = (count + 1) % Number.MAX_SAFE_INTEGER
  return `toast-${Date.now()}-${count}`
}

export function toast({
  title,
  description,
  variant = 'default',
  duration = 4000,
}: Omit<ToastMessage, 'id'>) {
  const id = generateId()

  const dismiss = () => {
    if (toastTimeouts.has(id)) {
      clearTimeout(toastTimeouts.get(id))
      toastTimeouts.delete(id)
    }
    dispatch({ type: 'DISMISS_TOAST', toastId: id })
  }

  dispatch({
    type: 'ADD_TOAST',
    toast: {
      id,
      title,
      description,
      variant,
      duration,
    },
  })

  if (duration > 0) {
    const timeout = setTimeout(() => {
      dismiss()
    }, duration)
    toastTimeouts.set(id, timeout)
  }

  return {
    id,
    dismiss,
  }
}

toast.success = (title: string, description?: string) =>
  toast({ title, description, variant: 'success' })

toast.error = (title: string, description?: string) =>
  toast({ title, description, variant: 'destructive' })

toast.warning = (title: string, description?: string) =>
  toast({ title, description, variant: 'warning' })

toast.info = (title: string, description?: string) =>
  toast({ title, description, variant: 'default' })

export function useToast() {
  const [state, setState] = React.useState<State>(memoryState)

  React.useEffect(() => {
    listeners.push(setState)
    return () => {
      const index = listeners.indexOf(setState)
      if (index > -1) {
        listeners.splice(index, 1)
      }
    }
  }, [state])

  return {
    ...state,
    toast,
    dismiss: (toastId: string) => dispatch({ type: 'DISMISS_TOAST', toastId }),
  }
}
