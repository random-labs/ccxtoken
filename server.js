#!/usr/bin/env node

const execSync = require('child_process').execSync
const http = require('http')
const port = 4444

http.createServer((request, response) => {
  console.log(request.url)
  response.end(execSync('tail ccx.log | grep -E "balance|height|links|FATAL"'))
}).listen(port, (err) => {
  if (err) { console.log(err); return }
  console.log(`server is listening on ${port}`)
})
