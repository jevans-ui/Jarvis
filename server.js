const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors({origin:'*'}));
app.options('*', cors({origin:'*'}));
app.use(express.json({limit:'10mb'}));
app.use(express.static(__dirname));

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
    console.log('Anthropic response status:', response.status);
    const data = await response.json();
    console.log('Sending response back to client');
    res.json(data);
  } catch (error) {
    console.error('Error calling Anthropic:', error.message);
    res.status(500).json({error:'Server error',details:error.message});
  }
});

app.get('/health', (req, res) => {
  res.json({status:'Jarvis online', port: PORT, key: process.env.ANTHROPIC_API_KEY ? 'SET' : 'MISSING'});
});

app.listen(PORT, '0.0.0.0', () => console.log(`Jarvis server running on port ${PORT}`));
