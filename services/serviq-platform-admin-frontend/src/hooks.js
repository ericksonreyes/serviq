import { useEffect, useState } from 'react'

// Debounce a fast-changing value. Convention: filter/autocomplete inputs
// (search boxes, combobox filters) debounce at ~500ms before applying.
export function useDebounced(value, delay = 500) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}
