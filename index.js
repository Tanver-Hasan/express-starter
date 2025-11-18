const express = require('express')
const app = express()
const dotenv = require('dotenv');
const port = process.env.PORT || 80;

dotenv.config();

app.get('/', (req, res) => {
  res.send('Hello World!')
})

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})
