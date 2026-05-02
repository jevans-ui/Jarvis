const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors({origin:'*'}));
app.options('*', cors({origin:'*'}));
app.use(express.json({limit:'10mb'}));
app.use(express.static(__dirname));

// Store tokens in memory (resets on server restart)
let googleTokens = null;

// ── Claude API ──
app.post('/api/chat', async (req, res) => {
  try {
    console.log('Received chat request');
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(req.body)
    });
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Error calling Anthropic:', error.message);
    res.status(500).json({error:'Server error', details:error.message});
  }
});

// ── Google Auth: Step 1 - Redirect to Google ──
app.get('/auth/google', (req, res) => {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: process.env.GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events',
    access_type: 'offline',
    prompt: 'consent'
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

// ── Google Auth: Step 2 - Handle callback ──
app.get('/auth/callback', async (req, res) => {
  const { code } = req.query;
  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {'Content-Type': 'application/x-www-form-urlencoded'},
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: process.env.GOOGLE_REDIRECT_URI,
        grant_type: 'authorization_code',
        code
      })
    });
    googleTokens = await response.json();
    console.log('Google tokens received successfully');
    res.redirect('/?calendar=connected');
  } catch (error) {
    console.error('Auth callback error:', error);
    res.redirect('/?calendar=error');
  }
});

// ── Check auth status ──
app.get('/auth/status', (req, res) => {
  res.json({connected: !!googleTokens});
});

// ── Get today's calendar events ──
app.get('/calendar/today', async (req, res) => {
  if (!googleTokens) return res.status(401).json({error:'Not authenticated'});
  try {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString();
    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${startOfDay}&timeMax=${endOfDay}&singleEvents=true&orderBy=startTime`,
      {headers: {Authorization: `Bearer ${googleTokens.access_token}`}}
    );
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({error: error.message});
  }
});

// ── Get upcoming events ──
app.get('/calendar/upcoming', async (req, res) => {
  if (!googleTokens) return res.status(401).json({error:'Not authenticated'});
  try {
    const now = new Date().toISOString();
    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${now}&maxResults=10&singleEvents=true&orderBy=startTime`,
      {headers: {Authorization: `Bearer ${googleTokens.access_token}`}}
    );
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({error: error.message});
  }
});

// ── Create a calendar event ──
app.post('/calendar/create', async (req, res) => {
  if (!googleTokens) return res.status(401).json({error:'Not authenticated'});
  try {
    const response = await fetch(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${googleTokens.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(req.body)
      }
    );
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({error: error.message});
  }
});

// ── Health check ──
app.get('/health', (req, res) => {
  res.json({
    status: 'Jarvis online',
    port: PORT,
    key: process.env.ANTHROPIC_API_KEY ? 'SET' : 'MISSING',
    calendar: googleTokens ? 'CONNECTED' : 'NOT CONNECTED'
  });
});

app.listen(PORT, '0.0.0.0', () => console.log(`Jarvis server running on port ${PORT}`));
