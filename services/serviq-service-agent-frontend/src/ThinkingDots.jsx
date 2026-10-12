import { useEffect, useState } from 'react'

// Shared AI loading idiom — animated ellipsis, one tick per second. Used on
// submit buttons whose round-trips include the AI parse upstream (payment
// evidence, remittance deposits); the host fields disable alongside.
export default function ThinkingDots({ text = 'Thinking' }) {
  const [dots, setDots] = useState(1)
  useEffect(() => {
    const id = setInterval(() => setDots((d) => (d % 3) + 1), 1000)
    return () => clearInterval(id)
  }, [])
  return <>{text}<span style={{ display: 'inline-block', width: '1rem', textAlign: 'left' }}>{'.'.repeat(dots)}</span></>
}
