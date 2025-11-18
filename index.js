const express = require('express');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const port = process.env.PORT || 80;

// View engine setup (EJS)
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Simple middleware for logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Home route
app.get('/', (req, res) => {
  res.render('home', {
    title: 'Home',
    message: 'Welcome to the Express Starter Lab',
  });
});

// About route
app.get('/about', (req, res) => {
  res.render('about', {
    title: 'About',
    description: 'This is a simple Express app running on AWS EC2 behind Cloudflare Tunnel.',
  });
});

// Status route (shows some runtime info)
app.get('/status', (req, res) => {
  const uptimeSeconds = process.uptime();
  res.render('status', {
    title: 'App Status',
    uptimeSeconds,
    nodeVersion: process.version,
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
  });
});

// Simple JSON API route
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Service is healthy',
    timestamp: new Date().toISOString(),
  });
});

// 404 handler (for unknown routes)
app.use((req, res) => {
  res.status(404).send('404 - Not Found');
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
