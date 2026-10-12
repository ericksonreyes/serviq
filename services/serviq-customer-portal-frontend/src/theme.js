import { createTheme } from '@mui/material'

// Shared ServIQ look — pastel violet/teal brand (Magic poster palette),
// Nunito rounded sans + Caveat script accents. Mobile-first: components
// size up, not down.
export const theme = createTheme({
  palette: {
    primary: { main: '#7c3aed' },
    secondary: { main: '#14b8a6' },
    background: { default: '#faf5ff', paper: '#ffffff' },
    text: { primary: '#1e1b4b' },
  },
  typography: {
    fontSize: 16,
    fontFamily: '"Nunito", "Segoe UI", system-ui, sans-serif',
    h3: { fontWeight: 800, letterSpacing: '-0.02em' },
    h5: { fontWeight: 700 },
    h6: { fontWeight: 700 },
    body2: { fontSize: '0.95rem', fontWeight: 500 },
    caption: { fontSize: '0.8rem' },
    button: { textTransform: 'none', fontWeight: 600, fontSize: '0.95rem' },
  },
  shape: { borderRadius: 12 },
  components: {
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: { root: { padding: '10px 20px' } },
    },
    MuiPaper: {
      styleOverrides: { root: { boxShadow: '0 1px 3px rgba(15,23,42,.08), 0 8px 24px -12px rgba(15,23,42,.12)' } },
    },
    MuiCard: {
      styleOverrides: { root: { boxShadow: '0 1px 3px rgba(15,23,42,.08)' } },
    },
    MuiTextField: { defaultProps: { variant: 'outlined' } },
    MuiAppBar: {
      styleOverrides: { root: { background: '#1e1b4b' } },
    },
  },
})
