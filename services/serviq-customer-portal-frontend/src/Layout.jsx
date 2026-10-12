import { useEffect, useState } from 'react'
import { Link, Outlet, useNavigate } from 'react-router-dom'
import { AppBar, Badge, Box, Button, IconButton, Toolbar, Typography } from '@mui/material'
import NotificationsIcon from '@mui/icons-material/Notifications'
import { api } from './api'
import { useAuth } from './auth'
import ChatWidget from './ChatWidget'

// Signed-in chrome: provider-branded floating bar + unread badge + chat widget.
export default function Layout() {
  const { token, refreshToken, setToken, claims } = useAuth()
  const [unread, setUnread] = useState(0)
  const [provider, setProvider] = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (!token) return
    api.notifications(token, '?unread=1')
      .then((res) => setUnread((res.data || []).length))
      .catch(() => {})
    // Header brands itself with the remembered provider (public directory).
    const slug = localStorage.getItem('serviq.provider')
    if (slug) api.provider(slug).then((res) => setProvider(res.data)).catch(() => {})
  }, [token])

  return (
    <>
      <AppBar position="sticky">
        <Toolbar sx={{ gap: 1 }}>
          <Box sx={{ flexGrow: 1, minWidth: 0, textDecoration: 'none', color: 'inherit' }} component={Link} to="/">
            <Typography variant="h6" noWrap>{provider?.name || 'Customer Portal'}</Typography>
            <Typography variant="caption" sx={{ opacity: 0.7, lineHeight: 1, display: 'block' }}>
              {provider ? 'Powered by ServIQ' : 'ServIQ'}
            </Typography>
          </Box>
          <Button color="inherit" component={Link} to="/" sx={{ display: { xs: 'none', sm: 'inline-flex' } }}>Home</Button>
          <Button color="inherit" component={Link} to="/catalog" sx={{ display: { xs: 'none', sm: 'inline-flex' } }}>Services</Button>
          <Button
            component={Link}
            to="/catalog"
            variant="contained"
            size="small"
            sx={{ bgcolor: '#14b8a6', '&:hover': { bgcolor: '#0d9488' }, whiteSpace: 'nowrap' }}
          >
            Book a service
          </Button>
          <IconButton color="inherit" component={Link} to="/notifications" aria-label="Notifications">
            <Badge badgeContent={unread} color="error">
              <NotificationsIcon />
            </Badge>
          </IconButton>
          {(claims?.display_name || claims?.username) && (
            <Typography variant="body2" noWrap sx={{ opacity: 0.85, display: { xs: 'none', md: 'block' } }}>
              Hi, {claims.display_name || claims.username}
            </Typography>
          )}
          <Button color="inherit" component={Link} to="/profile" sx={{ display: { xs: 'none', sm: 'inline-flex' } }}>Profile</Button>
          <Button
            color="inherit"
            sx={{ whiteSpace: 'nowrap' }}
            onClick={() => {
              api.logout(token, refreshToken).catch(() => {})
              setToken(null)
              navigate('/')
            }}
          >
            Sign out
          </Button>
        </Toolbar>
      </AppBar>
      <Outlet />
      <ChatWidget />
    </>
  )
}
