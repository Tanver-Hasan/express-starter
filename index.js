const app = require('./src/server');

const port = app.get('port');

app.listen(port, () => {
  app.log?.info
    ? app.log.info({ port }, 'Server listening (index.js)')
    : console.log(`Server listening on port ${port}`);
});
