import { useEffect, useState } from 'react'
import { Link, Outlet, useNavigate } from 'react-router-dom'
import { AppBar, Badge, Button, IconButton, Toolbar, Typography } from '@mui/material'
import NotificationsIcon from '@mui/icons-material/Notifications'
import { api } from './api'
import { useAuth } from './auth'
import ChatWidget from './ChatWidget'

// Signed-in chrome: channel nav + unread badge + the floating chat widget.
export default function Layout() {
  const { token, setToken } = useAuth()
  const [unread, setUnread] = useState(0)
  const navigate = useNavigate()

  useEffect(() => {
    if (!token) return
    api.notifications(token, '?unread=1')
      .then((res) => setUnread((res.data || []).length))
      .catch(() => {})
  }, [token])

  return (
    <>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1 }} component={Link} to="/" color="inherit" style={{ textDecoration: 'none' }}>
            ServIQ Customer Portal
          </Typography>
          <Button color="inherit" component={Link} to="/">Home</Button>
          <Button color="inherit" component={Link} to="/catalog">Services</Button>
          <IconButton color="inherit" component={Link} to="/notifications" aria-label="Notifications">
            <Badge badgeContent={unread} color="error">
              <NotificationsIcon />
            </Badge>
          </IconButton>
          <Button color="inherit" component={Link} to="/profile">Profile</Button>
          <Button color="inherit" onClick={() => { setToken(null); navigate('/') }}>Sign out</Button>
        </Toolbar>
      </AppBar>
      <Outlet />
      <ChatWidget />
    </>
  )
}
