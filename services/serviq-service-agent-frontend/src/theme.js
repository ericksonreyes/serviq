import { createTheme } from '@mui/material'

// Shared ServIQ look — deep indigo brand, comfortable 16px base type,
// soft cards. Mobile-first: components size up, not down.
export const theme = createTheme({
  palette: {
    primary: { main: '#0f766e' },
    secondary: { main: '#334155' },
    background: { default: '#f1f5f9', paper: '#ffffff' },
  },
  typography: {
    fontSize: 15,
    fontFamily: '"Inter", "Roboto", "Segoe UI", system-ui, sans-serif',
    h3: { fontWeight: 800, letterSpacing: '-0.02em' },
    h5: { fontWeight: 700 },
    h6: { fontWeight: 700 },
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
      styleOverrides: { root: { background: '#0f172a' } },
    },
  },
})
